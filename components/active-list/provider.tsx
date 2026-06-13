import {
	type PropsWithChildren,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { type Logger, useLogger } from "@/lib/logger";
import { ActiveListContext } from "./context";
import type {
	ActiveListState,
	ActiveListSyncCoordinator,
	AddActiveListItemDraft,
	AddActiveListItemInput,
} from "./types";

export type ActiveListProviderProps = PropsWithChildren<{
	state: ActiveListState;
	currentMemberName: string;
	onAddItem: (input: AddActiveListItemInput) => Promise<void>;
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
	state,
	currentMemberName,
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
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const mounted = useRef(true);

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const setErrorIfMounted = useCallback((message: string | null) => {
		if (mounted.current) {
			setErrorMessage(message);
		}
	}, []);

	const setRefreshingIfMounted = useCallback((refreshing: boolean) => {
		if (mounted.current) {
			setIsRefreshing(refreshing);
		}
	}, []);

	const requestLocalWriteSync = useCallback(() => {
		void syncCoordinator
			.requestSync({ reason: "localWrite" })
			.catch(() => undefined);
	}, [syncCoordinator]);

	const refresh = useCallback(async () => {
		setErrorIfMounted(null);
		setRefreshingIfMounted(true);
		try {
			await syncCoordinator.requestSync({ reason: "manualRefresh" });
		} catch (error) {
			if (syncCoordinator.getStatus() !== "failed") {
				logger.error("active list refresh failed", { error });
			}
			setErrorIfMounted("Unable to refresh this List. Please try again.");
		} finally {
			setRefreshingIfMounted(false);
		}
	}, [logger, setErrorIfMounted, setRefreshingIfMounted, syncCoordinator]);

	const addItem = useCallback(
		async (input: AddActiveListItemDraft) => {
			const name = input.name.trim();
			if (!name) return;
			const quantity = nullableTrimmed(input.quantity);
			const notes = nullableTrimmed(input.notes);

			try {
				await onAddItem({ name, quantity, notes });
				setErrorIfMounted(null);
				requestLocalWriteSync();
			} catch (error) {
				setErrorIfMounted("Unable to save that Item. Please try again.");
				throw error;
			}
		},
		[onAddItem, requestLocalWriteSync, setErrorIfMounted],
	);

	const toggleItem = useCallback(
		async (itemId: string) => {
			const target = state.items.find((item) => item.id === itemId);
			if (!target) return;

			try {
				await onSetItemChecked(itemId, !target.checked);
				setErrorIfMounted(null);
				requestLocalWriteSync();
			} catch {
				setErrorIfMounted("Unable to save that change. Please try again.");
			}
		},
		[onSetItemChecked, requestLocalWriteSync, setErrorIfMounted, state.items],
	);

	const actions = useMemo(
		() => ({ addItem, refresh, toggleItem }),
		[addItem, refresh, toggleItem],
	);

	const meta = useMemo(
		() => ({
			currentMemberName,
			errorMessage,
			isRefreshing,
			syncState,
		}),
		[currentMemberName, errorMessage, isRefreshing, syncState],
	);

	const value = useMemo(
		() => ({
			state,
			actions,
			meta,
		}),
		[actions, meta, state],
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
