import { useReducer } from "react";
import {
	AddItemComposer,
	type AddItemListOption,
} from "@/client/features/list/add-item-composer";
import type { AddListItemDraft } from "./list-view-types";

export type AddItemFormProps = {
	currentListId: string;
	listOptions: readonly AddItemListOption[];
	errorMessage: string | null;
	onAddItem: (input: AddListItemDraft) => Promise<void>;
	presentation?: AddItemFormPresentation;
};

export type AddItemFormPresentation =
	| { kind: "inline" }
	| {
			kind: "controlledOverlay";
			isOpen: boolean;
			onDismiss: () => void;
	  };

type ComposerState = {
	isOpen: boolean;
	name: string;
	quantity: string;
	notes: string;
	selectedListId: string;
	isSubmitting: boolean;
};

type ComposerAction =
	| { type: "opened" }
	| { type: "dismissed" }
	| { type: "nameChanged"; value: string }
	| { type: "quantityChanged"; value: string }
	| { type: "notesChanged"; value: string }
	| { type: "listChanged"; listId: string }
	| { type: "submitStarted" }
	| { type: "submitSucceeded" }
	| { type: "submitFailed" };

const INLINE_PRESENTATION = {
	kind: "inline",
} satisfies AddItemFormPresentation;

export function AddItemForm({
	currentListId,
	listOptions,
	errorMessage,
	onAddItem,
	presentation = INLINE_PRESENTATION,
}: AddItemFormProps) {
	const [composer, dispatchComposer] = useReducer(
		composerReducer,
		currentListId,
		initialComposerState,
	);
	const trimmedName = composer.name.trim();
	const canSubmit = trimmedName.length > 0 && !composer.isSubmitting;
	const isOpen =
		presentation.kind === "controlledOverlay"
			? presentation.isOpen
			: composer.isOpen;

	function openComposer() {
		if (presentation.kind === "controlledOverlay") return;
		dispatchComposer({ type: "opened" });
	}

	function dismissComposer() {
		dispatchComposer({ type: "dismissed" });
		if (presentation.kind === "controlledOverlay") presentation.onDismiss();
	}

	async function submit() {
		if (!canSubmit) return;

		dispatchComposer({ type: "submitStarted" });
		try {
			await onAddItem({
				listId: composer.selectedListId,
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
				isOpen,
				canSubmit,
				selectedListId: composer.selectedListId,
				listOptions,
				errorMessage,
			}}
			actions={{
				open: openComposer,
				dismiss: dismissComposer,
				changeList: (listId) =>
					dispatchComposer({ type: "listChanged", listId }),
				submit,
				changeName: (value) => dispatchComposer({ type: "nameChanged", value }),
				changeQuantity: (value) =>
					dispatchComposer({ type: "quantityChanged", value }),
				changeNotes: (value) =>
					dispatchComposer({ type: "notesChanged", value }),
			}}
			showRestingEntry={presentation.kind === "inline"}
		/>
	);
}

function initialComposerState(currentListId: string): ComposerState {
	return {
		isOpen: false,
		name: "",
		quantity: "",
		notes: "",
		selectedListId: currentListId,
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
		case "listChanged":
			return { ...state, selectedListId: action.listId };
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
