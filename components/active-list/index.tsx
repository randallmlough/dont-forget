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
	FlatList,
	type ListRenderItemInfo,
	Pressable,
	Text,
	TextInput,
	View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";

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

export type ActiveListActions = {
	addItem: (name: string) => Promise<void>;
	toggleItem: (itemId: string) => Promise<void>;
	refresh: () => Promise<void>;
};

export type ActiveListMeta = {
	currentMemberName: string;
	errorMessage: string | null;
	isRefreshing: boolean;
};

export type ActiveListDataAdapter = {
	load: () => Promise<ActiveListInitialState>;
	addItem: (name: string) => Promise<ActiveListItem>;
	setItemChecked: (itemId: string, checked: boolean) => Promise<void>;
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
	adapter: ActiveListDataAdapter;
}>;

const ActiveListContext = createContext<ActiveListContextValue | null>(null);

function ActiveListProvider({
	initialState,
	currentMemberName,
	adapter,
	children,
}: ActiveListProviderProps) {
	const [state, setState] = useState<ActiveListState>(initialState);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const mounted = useRef(true);
	const nextItemNumber = useRef(initialState.items.length + 1);
	const stateRef = useRef(initialState);

	const replaceState = useCallback((nextState: ActiveListState) => {
		if (!mounted.current) return;
		stateRef.current = nextState;
		setState(nextState);
	}, []);

	const updateState = useCallback(
		(updater: (previous: ActiveListState) => ActiveListState) => {
			if (!mounted.current) return;
			const nextState = updater(stateRef.current);
			stateRef.current = nextState;
			setState(nextState);
		},
		[],
	);

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			void adapter.close();
		};
	}, [adapter]);

	const loadFromAdapter = useCallback(async () => {
		const nextState = await adapter.load();
		replaceState(nextState);
	}, [adapter, replaceState]);

	const refresh = useCallback(async () => {
		setIsRefreshing(true);
		setErrorMessage(null);

		try {
			await loadFromAdapter();
		} catch {
			if (mounted.current) {
				setErrorMessage("Unable to refresh this List. Please try again.");
			}
		} finally {
			if (mounted.current) {
				setIsRefreshing(false);
			}
		}
	}, [loadFromAdapter]);

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

			updateState((previous) => ({
				...previous,
				items: [...previous.items, item],
			}));

			try {
				const persistedItem = await adapter.addItem(name);
				updateState((previous) => ({
					...previous,
					items: previous.items.map((existing) =>
						existing.id === item.id ? persistedItem : existing,
					),
				}));
				if (mounted.current) {
					setErrorMessage(null);
				}
			} catch {
				if (mounted.current) {
					setErrorMessage("Unable to save that Item. The List was refreshed.");
				}
				await loadFromAdapter().catch(() => undefined);
			}
		},
		[adapter, loadFromAdapter, updateState],
	);

	const toggleItem = useCallback(
		async (itemId: string) => {
			const target = stateRef.current.items.find((item) => item.id === itemId);
			if (!target) return;

			const checked = !target.checked;
			updateState((previous) => ({
				...previous,
				items: previous.items.map((item) => {
					if (item.id !== itemId) return item;
					return {
						...item,
						checked,
						checkedByMemberName: checked ? currentMemberName : null,
					};
				}),
			}));

			try {
				await adapter.setItemChecked(itemId, checked);
				if (mounted.current) {
					setErrorMessage(null);
				}
			} catch {
				if (mounted.current) {
					setErrorMessage(
						"Unable to save that change. The List was refreshed.",
					);
				}
				await loadFromAdapter().catch(() => undefined);
			}
		},
		[adapter, currentMemberName, loadFromAdapter, updateState],
	);

	const actions = useMemo<ActiveListActions>(
		() => ({ addItem, refresh, toggleItem }),
		[addItem, refresh, toggleItem],
	);
	const meta = useMemo<ActiveListMeta>(
		() => ({ currentMemberName, errorMessage, isRefreshing }),
		[currentMemberName, errorMessage, isRefreshing],
	);
	const value = useMemo<ActiveListContextValue>(
		() => ({ state, actions, meta }),
		[actions, meta, state],
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
			{meta.errorMessage ? (
				<Text style={styles.errorMessage}>{meta.errorMessage}</Text>
			) : null}
		</View>
	);
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
