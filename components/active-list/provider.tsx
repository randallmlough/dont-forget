import {
	type PropsWithChildren,
	useCallback,
	useEffect,
	useEffectEvent,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { type Logger, useLogger } from "@/lib/logger";
import {
	type ActiveListTransition,
	activeListReducer,
	initialActiveListModel,
} from "./active-list-state";
import { ActiveListContext } from "./context";
import type {
	ActiveListInitialState,
	ActiveListItem,
	ActiveListSyncCoordinator,
	AddActiveListItemDraft,
	AddActiveListItemInput,
} from "./types";

export type ActiveListProviderProps = PropsWithChildren<{
	initialState: ActiveListInitialState;
	currentMemberName: string;
	onLoadList: () => Promise<ActiveListInitialState>;
	onAddItem: (input: AddActiveListItemInput) => Promise<ActiveListItem>;
	onSetItemChecked: (itemId: string, checked: boolean) => Promise<void>;
	syncCoordinator: ActiveListSyncCoordinator;
	logger?: Logger;
}>;

export function ActiveListProvider({
	logger,
	...props
}: ActiveListProviderProps) {
	if (logger) {
		return <ActiveListProviderContent {...props} logger={logger} />;
	}

	return <ActiveListProviderWithLogger {...props} />;
}

type ActiveListProviderContentProps = Omit<
	ActiveListProviderProps,
	"logger"
> & {
	logger: Logger;
};

function ActiveListProviderWithLogger(
	props: Omit<ActiveListProviderProps, "logger">,
) {
	const logger = useLogger();
	return <ActiveListProviderContent {...props} logger={logger} />;
}

function ActiveListProviderContent({
	initialState,
	currentMemberName,
	onLoadList,
	onAddItem,
	onSetItemChecked,
	syncCoordinator,
	logger,
	children,
}: ActiveListProviderContentProps) {
	const syncState = useSyncExternalStore(
		(onStoreChange: () => void) => {
			const subscription = syncCoordinator.subscribe(onStoreChange);
			return () => subscription.remove();
		},
		() => syncCoordinator.getStatus(),
		() => syncCoordinator.getStatus(),
	);
	const [model, setModel] = useState(() =>
		initialActiveListModel(initialState),
	);
	const mounted = useRef(true);
	const nextItemNumber = useRef(initialState.items.length + 1);
	const modelRef = useRef(model);
	const previousSyncState = useRef(syncState);

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const dispatchIfMounted = useCallback((transition: ActiveListTransition) => {
		if (!mounted.current) return;
		const nextModel = activeListReducer(modelRef.current, transition);
		modelRef.current = nextModel;
		setModel(nextModel);
	}, []);

	const loadList = useCallback(async () => {
		const nextState = await onLoadList();
		dispatchIfMounted({ type: "listLoaded", list: nextState });
	}, [dispatchIfMounted, onLoadList]);

	const reloadListAfterSync = useEffectEvent(async () => {
		await loadList().catch((error) => {
			logger.error("active list reload after sync failed", { error });
		});
	});

	useEffect(() => {
		const lastSyncState = previousSyncState.current;
		previousSyncState.current = syncState;

		if (
			lastSyncState === "pending" &&
			syncState === "synced" &&
			!modelRef.current.isRefreshing
		) {
			void reloadListAfterSync();
		}
	}, [syncState]);

	const requestLocalWriteSync = useCallback(() => {
		void syncCoordinator
			.requestSync({ reason: "localWrite" })
			.catch(() => undefined);
	}, [syncCoordinator]);

	const refresh = useCallback(async () => {
		dispatchIfMounted({ type: "refreshRequested" });

		try {
			await syncCoordinator.requestSync({ reason: "manualRefresh" });
			await loadList();
		} catch (error) {
			if (syncCoordinator.getStatus() !== "failed") {
				logger.error("active list refresh failed", { error });
			}
			dispatchIfMounted({ type: "refreshFailed" });
		}
	}, [dispatchIfMounted, loadList, logger, syncCoordinator]);

	const addItem = useCallback(
		async (input: AddActiveListItemDraft) => {
			const name = input.name.trim();
			if (!name) return;
			const quantity = nullableTrimmed(input.quantity);
			const notes = nullableTrimmed(input.notes);

			const item: ActiveListItem = {
				id: `pending-item-${nextItemNumber.current}`,
				name,
				quantity,
				notes,
				checked: false,
				checkedByMemberName: null,
			};
			nextItemNumber.current += 1;

			dispatchIfMounted({ type: "itemAddedOptimistically", item });

			try {
				const persistedItem = await onAddItem({
					name,
					quantity,
					notes,
				});
				dispatchIfMounted({
					type: "itemAddPersisted",
					pendingItemId: item.id,
					item: persistedItem,
				});
				requestLocalWriteSync();
			} catch (error) {
				dispatchIfMounted({ type: "itemAddFailed", pendingItemId: item.id });
				await loadList().catch((reloadError) => {
					logger.error("active list reload after add failure failed", {
						error: reloadError,
					});
					dispatchIfMounted({ type: "itemAddReloadFailed" });
				});
				throw error;
			}
		},
		[dispatchIfMounted, loadList, logger, onAddItem, requestLocalWriteSync],
	);

	const toggleItem = useCallback(
		async (itemId: string) => {
			const target = modelRef.current.list.items.find(
				(item) => item.id === itemId,
			);
			if (!target) return;

			const checked = !target.checked;
			dispatchIfMounted({
				type: "itemToggledOptimistically",
				itemId,
				checked,
				checkedByMemberName: checked ? currentMemberName : null,
			});

			try {
				await onSetItemChecked(itemId, checked);
				dispatchIfMounted({ type: "itemTogglePersisted" });
				requestLocalWriteSync();
			} catch {
				dispatchIfMounted({ type: "itemToggleFailed" });
				await loadList().catch(() => undefined);
			}
		},
		[
			currentMemberName,
			dispatchIfMounted,
			loadList,
			onSetItemChecked,
			requestLocalWriteSync,
		],
	);

	const actions = useMemo(
		() => ({ addItem, refresh, toggleItem }),
		[addItem, refresh, toggleItem],
	);

	const meta = useMemo(
		() => ({
			currentMemberName,
			errorMessage: model.errorMessage,
			isRefreshing: model.isRefreshing,
			syncState,
		}),
		[currentMemberName, model.errorMessage, model.isRefreshing, syncState],
	);

	const value = useMemo(
		() => ({
			state: model.list,
			actions,
			meta,
		}),
		[actions, meta, model.list],
	);

	return (
		<ActiveListContext.Provider value={value}>
			{children}
		</ActiveListContext.Provider>
	);
}

function nullableTrimmed(value: string): string | null {
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}
