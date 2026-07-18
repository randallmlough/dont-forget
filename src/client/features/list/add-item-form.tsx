import { useReducer } from "react";
import { AddItemComposer } from "@/client/features/list/add-item-composer";
import type { AddActiveListItemDraft } from "./list-view-types";

export type AddItemFormProps = {
	listName: string;
	errorMessage: string | null;
	onOpenLists?: () => void;
	onAddItem: (input: AddActiveListItemDraft) => Promise<void>;
};

type ComposerState = {
	isOpen: boolean;
	name: string;
	quantity: string;
	notes: string;
	isSubmitting: boolean;
};

type ComposerAction =
	| { type: "opened" }
	| { type: "dismissed" }
	| { type: "nameChanged"; value: string }
	| { type: "quantityChanged"; value: string }
	| { type: "notesChanged"; value: string }
	| { type: "submitStarted" }
	| { type: "submitSucceeded" }
	| { type: "submitFailed" };

export function AddItemForm({
	listName,
	errorMessage,
	onOpenLists,
	onAddItem,
}: AddItemFormProps) {
	const [composer, dispatchComposer] = useReducer(
		composerReducer,
		undefined,
		initialComposerState,
	);
	const trimmedName = composer.name.trim();
	const canSubmit = trimmedName.length > 0 && !composer.isSubmitting;

	function openComposer() {
		dispatchComposer({ type: "opened" });
	}

	function dismissComposer() {
		dispatchComposer({ type: "dismissed" });
	}

	async function submit() {
		if (!canSubmit) return;

		dispatchComposer({ type: "submitStarted" });
		try {
			await onAddItem({
				name: trimmedName,
				quantity: composer.quantity,
				notes: composer.notes,
			});
			dispatchComposer({ type: "submitSucceeded" });
			dismissComposer();
		} catch {
			dispatchComposer({ type: "submitFailed" });
		}
	}

	return (
		<AddItemComposer
			draft={{
				name: composer.name,
				quantity: composer.quantity,
				notes: composer.notes,
			}}
			ui={{
				isOpen: composer.isOpen,
				canSubmit,
				listName,
				errorMessage,
			}}
			actions={{
				open: openComposer,
				dismiss: dismissComposer,
				openLists: onOpenLists,
				submit,
				changeName: (value) => dispatchComposer({ type: "nameChanged", value }),
				changeQuantity: (value) =>
					dispatchComposer({ type: "quantityChanged", value }),
				changeNotes: (value) =>
					dispatchComposer({ type: "notesChanged", value }),
			}}
		/>
	);
}

function initialComposerState(): ComposerState {
	return {
		isOpen: false,
		name: "",
		quantity: "",
		notes: "",
		isSubmitting: false,
	};
}

function composerReducer(
	state: ComposerState,
	action: ComposerAction,
): ComposerState {
	switch (action.type) {
		case "opened":
			return { ...state, isOpen: true };
		case "dismissed":
			return { ...state, isOpen: false, isSubmitting: false };
		case "nameChanged":
			return { ...state, name: action.value };
		case "quantityChanged":
			return { ...state, quantity: action.value };
		case "notesChanged":
			return { ...state, notes: action.value };
		case "submitStarted":
			return { ...state, isSubmitting: true };
		case "submitSucceeded":
			return {
				...state,
				name: "",
				quantity: "",
				notes: "",
				isSubmitting: false,
			};
		case "submitFailed":
			return { ...state, isSubmitting: false };
	}
}
