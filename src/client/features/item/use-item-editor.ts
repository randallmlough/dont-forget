import { useEffect, useReducer, useRef } from "react";
import { themedAlert } from "@/client/ui/native-dialogs";
import { toast } from "@/client/ui/toast";
import {
	type ItemEditorDetailsState,
	type ItemEditorInlineState,
	type ItemEditorState,
	initialItemEditorState,
	itemEditorReducer,
} from "./item-editor-reducer";
import type {
	ActiveListItem,
	AddListItemInput,
	ItemListOption,
	UpdateListItemInput,
} from "./item-view-types";

export type UseItemEditorInput = {
	currentListId: string;
	items: readonly ActiveListItem[];
	listOptions: readonly ItemListOption[];
	creationRequestKey: number | null;
	onAddItem: (input: AddListItemInput) => Promise<void>;
	onUpdateItem: (input: UpdateListItemInput) => Promise<void>;
	onSetItemChecked: (itemId: string, checked: boolean) => Promise<void>;
	onActiveChange: (active: boolean) => void;
};

export type ItemEditorActions = {
	startCreating: () => void;
	startEditing: (itemId: string) => Promise<void>;
	changeName: (value: string) => void;
	changeNotes: (value: string) => void;
	changeQuantity: (value: string) => void;
	showNote: () => void;
	submitTitle: () => Promise<void>;
	blurInlineEditor: (refocus: () => void) => Promise<void>;
	openDetails: () => void;
	cancelDetails: () => void;
	saveDetails: () => Promise<void>;
	openListSelector: () => void;
	closeListSelector: () => void;
	selectList: (listId: string) => void;
	toggleItem: (itemId: string) => Promise<void>;
};

export type ItemEditorMeta = {
	activeItemId: string | null;
	active: boolean;
	canSaveDetails: boolean;
	listOptions: readonly ItemListOption[];
	saving: boolean;
};

export type ItemEditor = {
	state: ItemEditorState;
	actions: ItemEditorActions;
	meta: ItemEditorMeta;
};

export function useItemEditor(input: UseItemEditorInput): ItemEditor {
	const {
		currentListId,
		items,
		listOptions,
		creationRequestKey,
		onAddItem,
		onUpdateItem,
		onSetItemChecked,
		onActiveChange,
	} = input;
	const [state, dispatch] = useReducer(
		itemEditorReducer,
		initialItemEditorState,
	);
	const handledCreationRequestRef = useRef<number | null>(null);
	const saveInFlightRef = useRef<Promise<boolean> | null>(null);

	useEffect(() => {
		if (
			creationRequestKey === null ||
			handledCreationRequestRef.current === creationRequestKey
		) {
			return;
		}
		handledCreationRequestRef.current = creationRequestKey;
		if (state.status !== "idle") return;
		dispatch({ type: "creationStarted", listId: currentListId });
	}, [creationRequestKey, currentListId, state.status]);

	const activeItemId = existingItemId(state);
	useEffect(() => {
		if (
			(state.status !== "inline" && state.status !== "details") ||
			activeItemId === null ||
			items.some((item) => item.id === activeItemId)
		) {
			return;
		}

		dispatch({ type: "editingEnded" });
		onActiveChange(false);
		toast.error("That Item is no longer available in this List.");
	}, [activeItemId, items, onActiveChange, state.status]);

	function performSave(
		editor: ItemEditorInlineState | ItemEditorDetailsState,
		continuation: "createNext" | "finish",
	): Promise<boolean> {
		if (saveInFlightRef.current) return saveInFlightRef.current;

		const request = saveEditor(editor, continuation);
		saveInFlightRef.current = request;
		void request.finally(() => {
			if (saveInFlightRef.current === request) {
				saveInFlightRef.current = null;
			}
		});
		return request;
	}

	async function saveEditor(
		editor: ItemEditorInlineState | ItemEditorDetailsState,
		continuation: "createNext" | "finish",
	): Promise<boolean> {
		const name = editor.draft.name.trim();
		if (!name) return false;

		dispatch({ type: "saveStarted", continuation });
		try {
			if (editor.source.kind === "new") {
				await onAddItem({
					listId: editor.draft.selectedListId,
					name,
					quantity: nullableTrimmed(editor.draft.quantity),
					notes: nullableTrimmed(editor.draft.notes),
				});
			} else {
				await onUpdateItem({
					itemId: editor.source.itemId,
					sourceListId: editor.source.sourceListId,
					destinationListId: editor.draft.selectedListId,
					name,
					quantity: nullableTrimmed(editor.draft.quantity),
					notes: nullableTrimmed(editor.draft.notes),
				});
			}
			dispatch({ type: "saveSucceeded", nextListId: currentListId });
			if (continuation === "finish") onActiveChange(false);
			return true;
		} catch {
			dispatch({ type: "saveFailed" });
			toast.error(saveFailureMessage(editor));
			return false;
		}
	}

	function startCreating() {
		if (state.status !== "idle") return;
		dispatch({ type: "creationStarted", listId: currentListId });
		onActiveChange(true);
	}

	async function startEditing(itemId: string) {
		const item = items.find((candidate) => candidate.id === itemId);
		if (!item || state.status === "saving" || state.status === "details")
			return;
		if (
			state.status === "inline" &&
			state.source.kind === "existing" &&
			state.source.itemId === itemId
		) {
			return;
		}
		if (state.status === "inline") {
			const hasName = state.draft.name.trim().length > 0;
			const hasOtherContent =
				state.draft.notes.trim().length > 0 ||
				state.draft.quantity.trim().length > 0;
			if (!hasName && !hasOtherContent) {
				dispatch({ type: "editingStarted", item, listId: currentListId });
				onActiveChange(true);
				return;
			}
			const saved = await saveInlineState(state, "finish");
			if (!saved) return;
		}

		dispatch({ type: "editingStarted", item, listId: currentListId });
		onActiveChange(true);
	}

	async function saveInlineState(
		editor: ItemEditorInlineState,
		continuation: "createNext" | "finish",
	): Promise<boolean> {
		const name = editor.draft.name.trim();
		const hasOtherContent =
			editor.draft.notes.trim().length > 0 ||
			editor.draft.quantity.trim().length > 0;
		if (!name) {
			if (!hasOtherContent) {
				dispatch({ type: "editingEnded" });
				onActiveChange(false);
			}
			return false;
		}
		return performSave(editor, continuation);
	}

	async function submitTitle() {
		if (state.status !== "inline") return;
		await saveInlineState(state, "createNext");
	}

	async function blurInlineEditor(refocus: () => void) {
		if (state.status !== "inline") return;
		const name = state.draft.name.trim();
		const hasOtherContent =
			state.draft.notes.trim().length > 0 ||
			state.draft.quantity.trim().length > 0;
		if (!name && hasOtherContent) {
			themedAlert(
				"Item Name Required",
				"An Item cannot be saved with notes or quantity alone.",
				[
					{
						text: "Discard",
						style: "destructive",
						onPress: () => {
							dispatch({ type: "editingEnded" });
							onActiveChange(false);
						},
					},
					{ text: "Keep Editing", onPress: refocus },
				],
			);
			return;
		}
		await saveInlineState(state, "finish");
	}

	function openDetails() {
		if (state.status === "inline") {
			dispatch({ type: "detailsOpened" });
		}
	}

	function cancelDetails() {
		if (state.status !== "details") return;
		dispatch({ type: "detailsCancelled" });
	}

	async function saveDetails() {
		if (state.status !== "details") return;
		if (!canSaveDetails(state, listOptions)) return;
		await performSave(state, "finish");
	}

	function openListSelector() {
		dispatch({ type: "listSelectorOpened" });
	}

	function closeListSelector() {
		dispatch({ type: "listSelectorClosed" });
	}

	function selectList(listId: string) {
		if (!listOptions.some((option) => option.id === listId)) return;
		dispatch({ type: "listSelected", listId });
	}

	async function toggleItem(itemId: string) {
		if (state.status === "saving" || state.status === "details") return;
		const item = items.find((candidate) => candidate.id === itemId);
		if (!item) return;

		if (
			state.status === "inline" &&
			state.source.kind === "existing" &&
			state.source.itemId === itemId
		) {
			const saved = await saveInlineState(state, "finish");
			if (!saved) return;
		}

		try {
			await onSetItemChecked(itemId, !item.checked);
			if (
				state.status === "inline" &&
				state.source.kind === "existing" &&
				state.source.itemId === itemId
			) {
				onActiveChange(false);
			}
		} catch {
			toast.error("Unable to save that completion change. Please try again.");
		}
	}

	return {
		state,
		actions: {
			startCreating,
			startEditing,
			changeName: (value) => dispatch({ type: "nameChanged", value }),
			changeNotes: (value) => dispatch({ type: "notesChanged", value }),
			changeQuantity: (value) => dispatch({ type: "quantityChanged", value }),
			showNote: () => dispatch({ type: "noteRequested" }),
			submitTitle,
			blurInlineEditor,
			openDetails,
			cancelDetails,
			saveDetails,
			openListSelector,
			closeListSelector,
			selectList,
			toggleItem,
		},
		meta: {
			activeItemId,
			active: state.status !== "idle",
			canSaveDetails:
				state.status === "details" ? canSaveDetails(state, listOptions) : false,
			listOptions,
			saving: state.status === "saving",
		},
	};
}

function existingItemId(state: ItemEditorState): string | null {
	if (state.status === "idle") return null;
	return state.source.kind === "existing" ? state.source.itemId : null;
}

function canSaveDetails(
	state: ItemEditorDetailsState,
	listOptions: readonly ItemListOption[],
): boolean {
	return (
		state.draft.name.trim().length > 0 &&
		listOptions.some((option) => option.id === state.draft.selectedListId)
	);
}

function nullableTrimmed(value: string): string | null {
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

function saveFailureMessage(
	editor: ItemEditorInlineState | ItemEditorDetailsState,
): string {
	if (editor.source.kind === "new") {
		return "Unable to add that Item. Please try again.";
	}
	if (editor.source.sourceListId !== editor.draft.selectedListId) {
		return "Unable to move that Item. Please try again.";
	}
	return "Unable to update that Item. Please try again.";
}
