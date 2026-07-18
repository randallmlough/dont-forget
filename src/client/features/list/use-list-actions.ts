import { useCallback, useState } from "react";
import type {
	ActiveListItem,
	AddListItemDraft,
	AddListItemInput,
} from "./list-view-types";

export type UseListActionsInput = {
	items: readonly ActiveListItem[];
	onAddItem: (input: AddListItemInput) => Promise<void>;
	onSetItemChecked: (itemId: string, checked: boolean) => Promise<void>;
};

export type UseListActionsResult = {
	addItem: (draft: AddListItemDraft) => Promise<void>;
	toggleItem: (itemId: string) => Promise<void>;
	errorMessage: string | null;
};

export function useListActions(
	input: UseListActionsInput,
): UseListActionsResult {
	const { items, onAddItem, onSetItemChecked } = input;
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const addItem = useCallback(
		async (draft: AddListItemDraft) => {
			const name = draft.name.trim();
			if (!name) return;
			const quantity = nullableTrimmed(draft.quantity);
			const notes = nullableTrimmed(draft.notes);

			try {
				await onAddItem({ listId: draft.listId, name, quantity, notes });
				setErrorMessage(null);
			} catch (error) {
				setErrorMessage("Unable to save that Item. Please try again.");
				throw error;
			}
		},
		[onAddItem],
	);

	const toggleItem = useCallback(
		async (itemId: string) => {
			const target = items.find((item) => item.id === itemId);
			if (!target) return;

			try {
				await onSetItemChecked(itemId, !target.checked);
				setErrorMessage(null);
			} catch {
				setErrorMessage("Unable to save that change. Please try again.");
			}
		},
		[items, onSetItemChecked],
	);

	return { addItem, toggleItem, errorMessage };
}

function nullableTrimmed(value: string): string | null {
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}
