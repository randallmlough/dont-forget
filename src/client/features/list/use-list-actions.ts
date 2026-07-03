import { useCallback, useEffect, useRef, useState } from "react";
import type {
	ActiveListItem,
	AddActiveListItemDraft,
	AddActiveListItemInput,
} from "./list-view-types";

export type UseListActionsInput = {
	items: readonly ActiveListItem[];
	onAddItem: (input: AddActiveListItemInput) => Promise<void>;
	onSetItemChecked: (itemId: string, checked: boolean) => Promise<void>;
};

export type UseListActionsResult = {
	addItem: (draft: AddActiveListItemDraft) => Promise<void>;
	toggleItem: (itemId: string) => Promise<void>;
	errorMessage: string | null;
};

export function useListActions(
	input: UseListActionsInput,
): UseListActionsResult {
	const { items, onAddItem, onSetItemChecked } = input;
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
		async (draft: AddActiveListItemDraft) => {
			const name = draft.name.trim();
			if (!name) return;
			const quantity = nullableTrimmed(draft.quantity);
			const notes = nullableTrimmed(draft.notes);

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
			const target = items.find((item) => item.id === itemId);
			if (!target) return;

			try {
				await onSetItemChecked(itemId, !target.checked);
				setErrorIfMounted(null);
			} catch {
				setErrorIfMounted("Unable to save that change. Please try again.");
			}
		},
		[items, onSetItemChecked, setErrorIfMounted],
	);

	return { addItem, toggleItem, errorMessage };
}

function nullableTrimmed(value: string): string | null {
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}
