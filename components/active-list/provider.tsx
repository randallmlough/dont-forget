import {
	type PropsWithChildren,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useLogger } from "@/lib/logger";
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
	AddActiveListItemInput,
} from "./types";

export type ActiveListProviderProps = PropsWithChildren<{
	initialState: ActiveListInitialState;
	currentMemberName: string;
	onLoadList: () => Promise<ActiveListInitialState>;
	onAddItem: (input: AddActiveListItemInput) => Promise<ActiveListItem>;
	onSetItemChecked: (itemId: string, checked: boolean) => Promise<void>;
	syncCoordinator: ActiveListSyncCoordinator;
}>;

export function ActiveListProvider({
	initialState,
	currentMemberName,
	onLoadList,
	onAddItem,
	onSetItemChecked,
	syncCoordinator,
	children,
}: ActiveListProviderProps) {
	const logger = useLogger();
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
	const observedSyncState = useRef(syncState);

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	useEffect(() => {
		observedSyncState.current = syncState;
	}, [syncState]);

	function dispatchIfMounted(transition: ActiveListTransition) {
		if (!mounted.current) return;
		const nextModel = activeListReducer(modelRef.current, transition);
		modelRef.current = nextModel;
		setModel(nextModel);
	}

	async function loadList() {
		const nextState = await onLoadList();
		dispatchIfMounted({ type: "listLoaded", list: nextState });
	}

	const reloadListAfterSync = useEffectEvent(async () => {
		await loadList();
	});

	const syncTransitioned = useEffectEvent(
		(syncState: ReturnType<ActiveListSyncCoordinator["getStatus"]>) => {
			const previousSyncState = observedSyncState.current;
			observedSyncState.current = syncState;
			const isManualRefresh = modelRef.current.isRefreshing;
			if (
				previousSyncState === "pending" &&
				syncState === "synced" &&
				!isManualRefresh
			) {
				void reloadListAfterSync().catch((error) => {
					logger.error("active list reload after sync failed", { error });
				});
			}
		},
	);

	useEffect(() => {
		const subscription = syncCoordinator.subscribe(syncTransitioned);
		return () => {
			subscription.remove();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- syncTransitioned is a React Effect Event; resubscribe only when the coordinator changes.
	}, [syncCoordinator]);

	function requestLocalWriteSync() {
		void syncCoordinator
			.requestSync({ reason: "localWrite" })
			.then(async (result) => {
				if (mounted.current && result?.changed) await loadList();
			})
			.catch(() => undefined);
	}

	async function refresh() {
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
	}

	async function addItem(input: AddActiveListItemInput) {
		const name = input.name.trim();
		if (!name) return;
		const quantity = nullableTrimmed(input.quantity);
		const note = nullableTrimmed(input.note);

		const item: ActiveListItem = {
			id: `pending-item-${nextItemNumber.current}`,
			name,
			quantity,
			note,
			checked: false,
			checkedByMemberName: null,
		};
		nextItemNumber.current += 1;

		dispatchIfMounted({ type: "itemAddedOptimistically", item });

		try {
			const persistedItem = await onAddItem({
				name,
				quantity: quantity ?? "",
				note: note ?? "",
			});
			dispatchIfMounted({
				type: "itemAddPersisted",
				pendingItemId: item.id,
				item: persistedItem,
			});
			requestLocalWriteSync();
		} catch (error) {
			dispatchIfMounted({ type: "itemAddFailed" });
			await loadList().catch(() => undefined);
			throw error;
		}
	}

	async function toggleItem(itemId: string) {
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
	}

	const value = {
		state: model.list,
		actions: { addItem, refresh, toggleItem },
		meta: {
			currentMemberName,
			errorMessage: model.errorMessage,
			isRefreshing: model.isRefreshing,
			syncState,
		},
	};

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
