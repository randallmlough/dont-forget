import {
	type PropsWithChildren,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { ActiveListContext } from "./context";
import type {
	ActiveListState,
	ActiveListSyncStatusSource,
	AddActiveListItemDraft,
	AddActiveListItemInput,
} from "./types";

export type ActiveListProviderProps = PropsWithChildren<{
	state: ActiveListState;
	currentMemberName: string;
	onAddItem: (input: AddActiveListItemInput) => Promise<void>;
	onSetItemChecked: (itemId: string, checked: boolean) => Promise<void>;
	syncStatus: ActiveListSyncStatusSource;
}>;

export function ActiveListProvider({
	state,
	currentMemberName,
	onAddItem,
	onSetItemChecked,
	syncStatus,
	children,
}: ActiveListProviderProps) {
	const syncState = useSyncExternalStore(
		(onStoreChange: () => void) => {
			const subscription = syncStatus.subscribe(onStoreChange);
			return () => subscription.remove();
		},
		() => syncStatus.getStatus(),
		() => syncStatus.getStatus(),
	);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

	const addItem = useCallback(
		async (input: AddActiveListItemDraft) => {
			const name = input.name.trim();
			if (!name) return;
			const quantity = nullableTrimmed(input.quantity);
			const notes = nullableTrimmed(input.notes);

			try {
				await onAddItem({ name, quantity, notes });
				setErrorIfMounted(null);
			} catch (error) {
				setErrorIfMounted("Unable to save that Item. Please try again.");
				throw error;
			}
		},
		[onAddItem, setErrorIfMounted],
	);

	const toggleItem = useCallback(
		async (itemId: string) => {
			const target = state.items.find((item) => item.id === itemId);
			if (!target) return;

			try {
				await onSetItemChecked(itemId, !target.checked);
				setErrorIfMounted(null);
			} catch {
				setErrorIfMounted("Unable to save that change. Please try again.");
			}
		},
		[onSetItemChecked, setErrorIfMounted, state.items],
	);

	const actions = useMemo(
		() => ({ addItem, toggleItem }),
		[addItem, toggleItem],
	);

	const meta = useMemo(
		() => ({
			currentMemberName,
			errorMessage,
			syncState,
		}),
		[currentMemberName, errorMessage, syncState],
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
