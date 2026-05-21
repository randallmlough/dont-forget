import {
	createContext,
	memo,
	type PropsWithChildren,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	AppState,
	FlatList,
	type ListRenderItemInfo,
	Pressable,
	Text,
	TextInput,
	View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";

import {
	type ActiveListTransition,
	activeListReducer,
	initialActiveListModel,
} from "@/components/active-list/active-list-state";
import { isNetworkUnavailableError } from "@/lib/errors";
import { useLogger } from "@/lib/logger";
import {
	type NetworkConnectivity,
	type NetworkStatusAdapter,
	networkStatusAdapter,
} from "@/lib/network-status";

export type ActiveListItem = {
	id: string;
	name: string;
	checked: boolean;
	checkedByMemberName?: string | null;
};

export type ActiveListState = {
	householdName: string;
	listName: string;
	items: ActiveListItem[];
};

export type ActiveListInitialState = ActiveListState;

export type ActiveListSyncState = "synced" | "pending" | "offline" | "failed";

export type ActiveListSyncResult = {
	changed: boolean;
};

export type ActiveListSyncOptions = {
	mode?: "full" | "pushLocalOnly";
};

export type ActiveListActions = {
	addItem: (name: string) => Promise<void>;
	toggleItem: (itemId: string) => Promise<void>;
	refresh: () => Promise<void>;
};

export type ActiveListMeta = {
	currentMemberName: string;
	errorMessage: string | null;
	isRefreshing: boolean;
	syncState: ActiveListSyncState;
};

export type ActiveListDataSource = {
	syncAuthorized: boolean;
	load: () => Promise<ActiveListInitialState>;
	addItem: (name: string) => Promise<ActiveListItem>;
	setItemChecked: (itemId: string, checked: boolean) => Promise<void>;
	pull: () => Promise<ActiveListSyncResult>;
	sync: (options?: ActiveListSyncOptions) => Promise<ActiveListSyncResult>;
	close: () => Promise<void>;
};

type ActiveListContextValue = {
	state: ActiveListState;
	actions: ActiveListActions;
	meta: ActiveListMeta;
};

type ActiveListProviderProps = PropsWithChildren<{
	initialState: ActiveListInitialState;
	currentMemberName: string;
	dataSource: ActiveListDataSource;
	networkStatus?: NetworkStatusAdapter;
}>;

const ActiveListContext = createContext<ActiveListContextValue | null>(null);
const OFFLINE_SYNC_RETRY_MS = 30_000;

function ActiveListProvider({
	initialState,
	currentMemberName,
	dataSource,
	networkStatus = networkStatusAdapter,
	children,
}: ActiveListProviderProps) {
	const logger = useLogger();
	const [model, setModel] = useState(() =>
		initialActiveListModel(
			initialState,
			dataSource.syncAuthorized ? "synced" : "offline",
		),
	);
	const mounted = useRef(true);
	const nextItemNumber = useRef(initialState.items.length + 1);
	const modelRef = useRef(model);
	const syncInFlight = useRef(false);
	const networkConnectivity = useRef<NetworkConnectivity>("unknown");
	const pendingLocalChangeVersion = useRef(0);

	const transition = useCallback((nextTransition: ActiveListTransition) => {
		if (!mounted.current) return;
		const nextModel = activeListReducer(modelRef.current, nextTransition);
		modelRef.current = nextModel;
		setModel(nextModel);
	}, []);

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			void dataSource.close();
		};
	}, [dataSource]);

	const loadFromDataSource = useCallback(async () => {
		const nextState = await dataSource.load();
		transition({ type: "listLoaded", list: nextState });
	}, [dataSource, transition]);

	const syncLatest = useCallback(
		async (options?: ActiveListSyncOptions) => {
			if (!dataSource.syncAuthorized) {
				transition({ type: "syncUnavailable" });
				await loadFromDataSource();
				return;
			}

			if (networkConnectivity.current === "offline") {
				transition({ type: "syncUnavailable" });
				await loadFromDataSource();
				return;
			}

			transition({ type: "syncStarted" });
			syncInFlight.current = true;
			const syncStartedAtChangeVersion = pendingLocalChangeVersion.current;

			try {
				await dataSource.sync(options);
				await loadFromDataSource();
				if (pendingLocalChangeVersion.current === syncStartedAtChangeVersion) {
					pendingLocalChangeVersion.current = 0;
					transition({ type: "syncSucceeded" });
				} else {
					transition({ type: "syncStarted" });
				}
			} catch (error) {
				if (isNetworkUnavailableError(error)) {
					transition({ type: "syncUnavailable" });
					return;
				}
				transition({ type: "syncFailed" });
				throw error;
			} finally {
				syncInFlight.current = false;
			}
		},
		[dataSource, loadFromDataSource, transition],
	);

	const syncAfterLocalWrite = useCallback(async () => {
		if (!dataSource.syncAuthorized) {
			transition({ type: "syncUnavailable" });
			return;
		}

		if (networkConnectivity.current === "offline") {
			transition({ type: "syncUnavailable" });
			return;
		}

		if (syncInFlight.current) return;

		transition({ type: "syncStarted" });
		syncInFlight.current = true;
		const syncStartedAtChangeVersion = pendingLocalChangeVersion.current;

		try {
			const result = await dataSource.sync({ mode: "pushLocalOnly" });
			if (result.changed) {
				await loadFromDataSource();
			}
			if (pendingLocalChangeVersion.current === syncStartedAtChangeVersion) {
				pendingLocalChangeVersion.current = 0;
				transition({ type: "syncSucceeded" });
			} else {
				transition({ type: "syncStarted" });
			}
		} catch (error) {
			if (isNetworkUnavailableError(error)) {
				transition({ type: "syncUnavailable" });
				return;
			}

			logger.error("active list sync failed", { error });
			transition({ type: "syncFailed" });
		} finally {
			syncInFlight.current = false;
		}
	}, [dataSource, loadFromDataSource, logger, transition]);

	const handleNetworkStatusChange = useCallback(
		(nextConnectivity: NetworkConnectivity) => {
			const previousConnectivity = networkConnectivity.current;
			networkConnectivity.current = nextConnectivity;

			if (nextConnectivity === "offline") {
				transition({ type: "syncUnavailable" });
				return;
			}

			if (
				nextConnectivity === "online" &&
				previousConnectivity !== "online" &&
				dataSource.syncAuthorized &&
				pendingLocalChangeVersion.current > 0 &&
				!syncInFlight.current
			) {
				void syncLatest({ mode: "pushLocalOnly" }).catch((error) => {
					logger.error("active list reconnect sync failed", { error });
				});
			}
		},
		[dataSource.syncAuthorized, logger, syncLatest, transition],
	);

	useEffect(() => {
		let stopped = false;

		networkStatus
			.getCurrentStatus()
			.then((status) => {
				if (!stopped) handleNetworkStatusChange(status.connectivity);
			})
			.catch((error) => {
				logger.error("network status fetch failed", { error });
			});

		const subscription = networkStatus.subscribe((status) => {
			if (!stopped) handleNetworkStatusChange(status.connectivity);
		});

		return () => {
			stopped = true;
			subscription.remove();
		};
	}, [handleNetworkStatusChange, logger, networkStatus]);

	useEffect(() => {
		if (!dataSource.syncAuthorized) {
			transition({ type: "syncUnavailable" });
			return;
		}

		void syncLatest({ mode: "pushLocalOnly" }).catch((error) => {
			logger.error("active list initial sync failed", { error });
		});
	}, [dataSource.syncAuthorized, logger, syncLatest, transition]);

	useEffect(() => {
		if (!dataSource.syncAuthorized) return;

		let stopped = false;

		async function retrySyncWhenForegrounded() {
			if (
				stopped ||
				syncInFlight.current ||
				networkConnectivity.current === "offline" ||
				modelRef.current.syncState === "synced" ||
				AppState.currentState === "background" ||
				AppState.currentState === "inactive"
			) {
				return;
			}

			try {
				await syncLatest({ mode: "pushLocalOnly" });
			} catch (error) {
				logger.error("active list periodic sync failed", { error });
			}
		}

		const interval = setInterval(() => {
			void retrySyncWhenForegrounded();
		}, OFFLINE_SYNC_RETRY_MS);
		const subscription = AppState.addEventListener("change", (state) => {
			if (state === "active") {
				void retrySyncWhenForegrounded();
			}
		});

		return () => {
			stopped = true;
			clearInterval(interval);
			subscription.remove();
		};
	}, [dataSource.syncAuthorized, logger, syncLatest]);

	const refresh = useCallback(async () => {
		transition({ type: "refreshRequested" });

		try {
			await syncLatest();
		} catch (error) {
			logger.error("active list refresh failed", { error });
			transition({ type: "refreshFailed" });
		}
	}, [logger, syncLatest, transition]);

	const addItem = useCallback(
		async (rawName: string) => {
			const name = rawName.trim();
			if (!name) return;

			const item: ActiveListItem = {
				id: `pending-item-${nextItemNumber.current}`,
				name,
				checked: false,
				checkedByMemberName: null,
			};
			nextItemNumber.current += 1;

			transition({ type: "itemAddedOptimistically", item });

			try {
				const persistedItem = await dataSource.addItem(name);
				transition({
					type: "itemAddPersisted",
					pendingItemId: item.id,
					item: persistedItem,
				});
				pendingLocalChangeVersion.current += 1;
				void syncAfterLocalWrite();
			} catch {
				transition({ type: "itemAddFailed" });
				await loadFromDataSource().catch(() => undefined);
			}
		},
		[dataSource, loadFromDataSource, syncAfterLocalWrite, transition],
	);

	const toggleItem = useCallback(
		async (itemId: string) => {
			const target = modelRef.current.list.items.find(
				(item) => item.id === itemId,
			);
			if (!target) return;

			const checked = !target.checked;
			transition({
				type: "itemToggledOptimistically",
				itemId,
				checked,
				checkedByMemberName: checked ? currentMemberName : null,
			});

			try {
				await dataSource.setItemChecked(itemId, checked);
				transition({ type: "itemTogglePersisted" });
				pendingLocalChangeVersion.current += 1;
				void syncAfterLocalWrite();
			} catch {
				transition({ type: "itemToggleFailed" });
				await loadFromDataSource().catch(() => undefined);
			}
		},
		[
			dataSource,
			currentMemberName,
			loadFromDataSource,
			syncAfterLocalWrite,
			transition,
		],
	);

	const actions = useMemo<ActiveListActions>(
		() => ({ addItem, refresh, toggleItem }),
		[addItem, refresh, toggleItem],
	);
	const meta = useMemo<ActiveListMeta>(
		() => ({
			currentMemberName,
			errorMessage: model.errorMessage,
			isRefreshing: model.isRefreshing,
			syncState: model.syncState,
		}),
		[
			currentMemberName,
			model.errorMessage,
			model.isRefreshing,
			model.syncState,
		],
	);
	const value = useMemo<ActiveListContextValue>(
		() => ({ state: model.list, actions, meta }),
		[actions, meta, model.list],
	);

	return (
		<ActiveListContext.Provider value={value}>
			{children}
		</ActiveListContext.Provider>
	);
}

export function useActiveList() {
	const value = useContext(ActiveListContext);
	if (!value) {
		throw new Error("useActiveList must be used inside ActiveList.Provider");
	}
	return value;
}

function ActiveListScreen({ children }: PropsWithChildren) {
	return <View style={styles.screen}>{children}</View>;
}

function ActiveListHeader() {
	const { actions, meta, state } = useActiveList();
	const itemCount = state.items.length;
	const checkedCount = state.items.filter((item) => item.checked).length;
	const progressLabel =
		itemCount === 0
			? "No Items yet"
			: `${checkedCount} of ${itemCount} Items checked`;

	return (
		<View style={styles.header}>
			<View style={styles.headerTopRow}>
				<Text style={styles.householdName}>{state.householdName}</Text>
				<Pressable
					accessibilityRole="button"
					accessibilityState={{ busy: meta.isRefreshing }}
					onPress={() => void actions.refresh()}
					style={({ pressed }) => [
						styles.refreshButton,
						pressed ? styles.refreshButtonPressed : undefined,
					]}
				>
					<Text style={styles.refreshButtonLabel}>
						{meta.isRefreshing ? "Refreshing" : "Refresh"}
					</Text>
				</Pressable>
			</View>
			<Text style={styles.listName}>{state.listName}</Text>
			<Text style={styles.progressLabel}>{progressLabel}</Text>
			<Text style={[styles.syncStatus, syncStatusStyle(meta.syncState)]}>
				{syncStatusLabel(meta.syncState)}
			</Text>
			{meta.errorMessage ? (
				<Text style={styles.errorMessage}>{meta.errorMessage}</Text>
			) : null}
		</View>
	);
}

function syncStatusLabel(syncState: ActiveListSyncState): string {
	switch (syncState) {
		case "synced":
			return "Synced";
		case "pending":
			return "Pending sync";
		case "offline":
			return "Offline - changes saved locally";
		case "failed":
			return "Sync failed - changes saved locally";
	}
}

function syncStatusStyle(syncState: ActiveListSyncState) {
	switch (syncState) {
		case "synced":
			return styles.syncStatusSynced;
		case "pending":
			return styles.syncStatusPending;
		case "failed":
			return styles.syncStatusFailed;
		case "offline":
			return undefined;
	}
}

function ActiveListItems() {
	const { state } = useActiveList();

	return (
		<FlatList
			data={state.items}
			keyExtractor={keyExtractor}
			renderItem={renderItem}
			ItemSeparatorComponent={ItemSeparator}
			ListEmptyComponent={EmptyList}
			keyboardShouldPersistTaps="handled"
			contentContainerStyle={[
				styles.itemsContent,
				state.items.length === 0 ? styles.emptyItemsContent : undefined,
			]}
		/>
	);
}

function ActiveListAddItemForm() {
	const { actions } = useActiveList();
	const [name, setName] = useState("");
	const trimmedName = name.trim();
	const canSubmit = trimmedName.length > 0;

	function submit() {
		if (!canSubmit) return;
		void actions.addItem(trimmedName);
		setName("");
	}

	return (
		<View style={styles.addForm}>
			<TextInput
				accessibilityLabel="Item name"
				value={name}
				onChangeText={setName}
				placeholder="Add an Item"
				returnKeyType="done"
				onSubmitEditing={submit}
				style={styles.input}
			/>
			<Pressable
				accessibilityRole="button"
				accessibilityState={{ disabled: !canSubmit }}
				disabled={!canSubmit}
				onPress={submit}
				style={({ pressed }) => [
					styles.addButton,
					!canSubmit ? styles.addButtonDisabled : undefined,
					pressed && canSubmit ? styles.addButtonPressed : undefined,
				]}
			>
				<Text style={styles.addButtonLabel}>Add</Text>
			</Pressable>
		</View>
	);
}

const ItemRow = memo(function ItemRow({ item }: { item: ActiveListItem }) {
	const { actions } = useActiveList();

	const toggle = useCallback(() => {
		void actions.toggleItem(item.id);
	}, [actions, item.id]);

	return (
		<Pressable
			accessibilityRole="checkbox"
			accessibilityState={{ checked: item.checked }}
			onPress={toggle}
			style={({ pressed }) => [
				styles.itemRow,
				pressed ? styles.itemRowPressed : undefined,
			]}
		>
			<View
				style={[
					styles.checkbox,
					item.checked ? styles.checkboxChecked : undefined,
				]}
			>
				{item.checked ? <View style={styles.checkboxMark} /> : null}
			</View>
			<View style={styles.itemTextGroup}>
				<Text
					style={[
						styles.itemName,
						item.checked ? styles.itemNameChecked : undefined,
					]}
				>
					{item.name}
				</Text>
				{item.checkedByMemberName ? (
					<Text style={styles.itemMeta}>
						Checked by {item.checkedByMemberName}
					</Text>
				) : null}
			</View>
		</Pressable>
	);
});

function EmptyList() {
	return (
		<View style={styles.emptyState}>
			<Text style={styles.emptyTitle}>This List is empty.</Text>
			<Text style={styles.emptyBody}>
				Add the first Item for your Household.
			</Text>
		</View>
	);
}

function ItemSeparator() {
	return <View style={styles.itemSeparator} />;
}

function keyExtractor(item: ActiveListItem) {
	return item.id;
}

function renderItem({ item }: ListRenderItemInfo<ActiveListItem>) {
	return <ItemRow item={item} />;
}

export const ActiveList = {
	Provider: ActiveListProvider,
	Screen: ActiveListScreen,
	Header: ActiveListHeader,
	Items: ActiveListItems,
	AddItemForm: ActiveListAddItemForm,
};

const styles = StyleSheet.create((theme) => ({
	screen: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	header: {
		paddingHorizontal: theme.spacing(5),
		paddingTop: theme.spacing(5),
		paddingBottom: theme.spacing(4),
		gap: theme.spacing(1),
		backgroundColor: theme.colors.surface,
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	headerTopRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: theme.spacing(3),
	},
	householdName: {
		flex: 1,
		color: theme.colors.textMuted,
		fontSize: theme.fontSizes.footnote,
		fontWeight: theme.fontWeights.semibold,
	},
	refreshButton: {
		minHeight: theme.spacing(11),
		paddingHorizontal: theme.spacing(2.5),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.background,
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.border,
	},
	refreshButtonPressed: {
		opacity: theme.opacities.pressed,
	},
	refreshButtonLabel: {
		...theme.typography.caption,
		color: theme.colors.text,
		fontWeight: theme.fontWeights.bold,
	},
	listName: {
		...theme.typography.largeTitle,
		color: theme.colors.text,
	},
	progressLabel: {
		...theme.typography.callout,
		color: theme.colors.textMuted,
	},
	syncStatus: {
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
	},
	syncStatusSynced: {
		color: theme.colors.primary,
	},
	syncStatusPending: {
		color: theme.colors.link,
	},
	syncStatusFailed: {
		color: theme.colors.destructive,
	},
	errorMessage: {
		fontSize: theme.fontSizes.footnote,
		fontWeight: theme.fontWeights.semibold,
		marginTop: theme.spacing(2),
		color: theme.colors.destructive,
	},
	itemsContent: {
		padding: theme.spacing(5),
	},
	emptyItemsContent: {
		flexGrow: 1,
		justifyContent: "center",
	},
	emptyState: {
		alignItems: "center",
		gap: theme.spacing(2),
		padding: theme.spacing(7),
		borderRadius: theme.radii.card,
		borderCurve: "continuous",
		backgroundColor: theme.colors.surface,
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.border,
	},
	emptyTitle: {
		fontSize: theme.fontSizes.titleSmall,
		fontWeight: theme.fontWeights.bold,
		color: theme.colors.text,
		textAlign: "center",
	},
	emptyBody: {
		...theme.typography.callout,
		color: theme.colors.textMuted,
		textAlign: "center",
	},
	itemRow: {
		minHeight: theme.spacing(16),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		padding: theme.spacing(3.5),
		borderRadius: theme.radii.card,
		borderCurve: "continuous",
		backgroundColor: theme.colors.surface,
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.border,
	},
	itemRowPressed: {
		opacity: theme.opacities.pressed,
	},
	checkbox: {
		width: theme.spacing(6),
		height: theme.spacing(6),
		borderRadius: theme.radii.checkbox,
		borderCurve: "continuous",
		borderWidth: theme.borders.thick,
		borderColor: theme.colors.textSubtle,
		alignItems: "center",
		justifyContent: "center",
	},
	checkboxChecked: {
		borderColor: theme.colors.primary,
		backgroundColor: theme.colors.primary,
	},
	checkboxMark: {
		width: theme.spacing(2.5),
		height: theme.spacing(2.5),
		borderRadius: theme.radii.checkboxMark,
		backgroundColor: theme.colors.inverseText,
	},
	itemTextGroup: {
		flex: 1,
		minWidth: 0,
	},
	itemName: {
		color: theme.colors.text,
		fontSize: theme.fontSizes.subheadline,
		fontWeight: theme.fontWeights.semibold,
	},
	itemNameChecked: {
		color: theme.colors.textMuted,
		textDecorationLine: "line-through",
	},
	itemMeta: {
		...theme.typography.caption,
		color: theme.colors.textSubtle,
		marginTop: theme.spacing(0.5),
	},
	itemSeparator: {
		height: theme.spacing(2.5),
	},
	addForm: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(2.5),
		padding: theme.spacing(4),
		backgroundColor: theme.colors.surface,
		borderTopWidth: theme.borders.hairline,
		borderTopColor: theme.colors.border,
	},
	input: {
		flex: 1,
		minHeight: theme.spacing(12),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.inputBorder,
		paddingHorizontal: theme.spacing(3.5),
		color: theme.colors.text,
		fontSize: theme.fontSizes.body,
		backgroundColor: theme.colors.surface,
	},
	addButton: {
		minWidth: theme.spacing(18),
		height: theme.spacing(12),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.primary,
	},
	addButtonDisabled: {
		backgroundColor: theme.colors.primaryDisabled,
	},
	addButtonPressed: {
		opacity: theme.opacities.pressed,
	},
	addButtonLabel: {
		...theme.typography.controlLabel,
		color: theme.colors.inverseText,
	},
}));
