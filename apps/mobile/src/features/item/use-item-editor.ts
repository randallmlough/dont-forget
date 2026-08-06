import { type Dispatch, useEffect, useMemo, useReducer, useRef } from "react";
import { themedAlert } from "@mobile/ui/native-dialogs";
import { toast } from "@mobile/ui/toast";
import {
	detailsPresentationFromState,
	type ItemEditorAction,
	type ItemEditorDetailsPresentation,
	type ItemEditorDetailsState,
	type ItemEditorInlinePresentation,
	type ItemEditorInlineState,
	type ItemEditorState,
	initialItemEditorState,
	inlinePresentationFromState,
	itemEditorReducer,
} from "./item-editor-reducer";
import { nullableTrimmed } from "./item-service";
import type {
	ActiveListItem,
	AddListItemInput,
	DeleteListItemInput,
	ItemDraftValues,
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
	onDeleteItem: (input: DeleteListItemInput) => Promise<void>;
	onSetItemChecked: (itemId: string, checked: boolean) => Promise<void>;
	onActiveChange: (active: boolean) => void;
	onCreationRequestAcknowledged?: (requestKey: number) => void;
};

export type ItemEditorActions = {
	startEditing: (itemId: string) => Promise<void>;
	changeName: (value: string) => void;
	changeNotes: (value: string) => void;
	changeQuantity: (value: string) => void;
	showNote: () => void;
	submitTitle: () => Promise<void>;
	blurInlineEditor: (refocus: () => void) => Promise<boolean>;
	finish: (refocus?: () => void) => Promise<boolean>;
	openDetails: () => void;
	cancelDetails: () => void;
	saveDetails: () => Promise<void>;
	deleteItem: () => Promise<void>;
	openListSelector: () => void;
	closeListSelector: () => void;
	selectList: (listId: string) => void;
	toggleItem: (itemId: string) => Promise<void>;
};

export type ItemEditorMeta = {
	canSaveDetails: boolean;
	listOptions: readonly ItemListOption[];
};

export type ItemEditor = {
	state: ItemEditorState;
	inline: ItemEditorInlinePresentation | null;
	details: ItemEditorDetailsPresentation | null;
	actions: ItemEditorActions;
	meta: ItemEditorMeta;
};

export function useItemEditor(input: UseItemEditorInput): ItemEditor {
	const [state, dispatch] = useReducer(
		itemEditorReducer,
		initialItemEditorState,
	);
	// Actions are created once and read the latest state and input through this
	// ref, so their identities survive re-renders and memoized rows can bail out.
	const latestRef = useRef({ state, input });
	useEffect(() => {
		latestRef.current = { state, input };
	});
	const actions = useMemo(
		// The getter reads the ref only when an action runs, never during render;
		// deferring the read is what keeps the actions' identities stable.
		// eslint-disable-next-line react-hooks/refs
		() => createItemEditorActions(dispatch, () => latestRef.current),
		[],
	);
	const handledCreationRequestRef = useRef<number | null>(null);

	const {
		creationRequestKey,
		currentListId,
		items,
		listOptions,
		onActiveChange,
		onCreationRequestAcknowledged,
	} = input;

	useEffect(() => {
		if (
			creationRequestKey === null ||
			handledCreationRequestRef.current === creationRequestKey
		) {
			return;
		}
		if (state.status !== "idle") return;
		handledCreationRequestRef.current = creationRequestKey;
		dispatch({ type: "creationStarted", listId: currentListId });
		onActiveChange(true);
		onCreationRequestAcknowledged?.(creationRequestKey);
	}, [
		creationRequestKey,
		currentListId,
		onActiveChange,
		onCreationRequestAcknowledged,
		state.status,
	]);

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

	const inline = useMemo(() => inlinePresentationFromState(state), [state]);
	const details = useMemo(() => detailsPresentationFromState(state), [state]);

	return {
		state,
		inline,
		details,
		actions,
		meta: {
			canSaveDetails:
				state.status === "details" ? canSaveDetails(state, listOptions) : false,
			listOptions,
		},
	};
}

type LatestEditor = {
	state: ItemEditorState;
	input: UseItemEditorInput;
};

function createItemEditorActions(
	dispatch: Dispatch<ItemEditorAction>,
	getLatest: () => LatestEditor,
): ItemEditorActions {
	type SaveIntent = {
		continuation: "createNext" | "finish";
	};
	let saveInFlight: {
		intent: SaveIntent;
		promise: Promise<boolean>;
	} | null = null;

	function performSave(
		editor: ItemEditorInlineState | ItemEditorDetailsState,
		continuation: "createNext" | "finish",
	): Promise<boolean> {
		if (saveInFlight) {
			return continuation === "finish"
				? finishSaveInFlight()
				: saveInFlight.promise;
		}

		const intent: SaveIntent = { continuation };
		const request = saveEditor(editor, intent);
		saveInFlight = { intent, promise: request };
		void request.finally(() => {
			if (saveInFlight?.promise === request) {
				saveInFlight = null;
			}
		});
		return request;
	}

	function finishSaveInFlight(): Promise<boolean> {
		if (!saveInFlight) return Promise.resolve(false);
		if (saveInFlight.intent.continuation !== "finish") {
			saveInFlight.intent.continuation = "finish";
			dispatch({ type: "finishRequested" });
		}
		return saveInFlight.promise;
	}

	async function saveEditor(
		editor: ItemEditorInlineState | ItemEditorDetailsState,
		intent: SaveIntent,
	): Promise<boolean> {
		const { input } = getLatest();
		const name = editor.draft.name.trim();
		if (!name) return false;

		dispatch({ type: "saveStarted", continuation: intent.continuation });
		try {
			if (editor.source.kind === "new") {
				await input.onAddItem({
					listId: editor.draft.selectedListId,
					name,
					quantity: nullableTrimmed(editor.draft.quantity),
					notes: nullableTrimmed(editor.draft.notes),
				});
			} else {
				await input.onUpdateItem({
					itemId: editor.source.itemId,
					sourceListId: editor.source.sourceListId,
					destinationListId: editor.draft.selectedListId,
					name,
					quantity: nullableTrimmed(editor.draft.quantity),
					notes: nullableTrimmed(editor.draft.notes),
				});
			}
			dispatch({ type: "saveSucceeded", nextListId: input.currentListId });
			if (intent.continuation === "finish") input.onActiveChange(false);
			return true;
		} catch {
			dispatch({ type: "saveFailed" });
			toast.error(saveFailureMessage(editor));
			return false;
		}
	}

	async function saveInlineState(
		editor: ItemEditorInlineState,
		continuation: "createNext" | "finish",
	): Promise<boolean> {
		const { hasName, hasOtherContent } = draftContent(editor.draft);
		if (!hasName) {
			if (!hasOtherContent) {
				dispatch({ type: "editingEnded" });
				getLatest().input.onActiveChange(false);
				return true;
			}
			return false;
		}
		return performSave(editor, continuation);
	}

	async function startEditing(itemId: string) {
		const { state, input } = getLatest();
		const item = input.items.find((candidate) => candidate.id === itemId);
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
			const { hasName, hasOtherContent } = draftContent(state.draft);
			if (!hasName && !hasOtherContent) {
				dispatch({ type: "editingStarted", item, listId: input.currentListId });
				input.onActiveChange(true);
				return;
			}
			const saved = await saveInlineState(state, "finish");
			if (!saved) return;
		}

		dispatch({ type: "editingStarted", item, listId: input.currentListId });
		input.onActiveChange(true);
	}

	async function submitTitle() {
		const { state } = getLatest();
		if (state.status !== "inline") return;
		await saveInlineState(state, "createNext");
	}

	async function finish(refocus: () => void = () => undefined) {
		const { state, input } = getLatest();
		if (state.status === "idle") return true;
		if (state.status === "saving") {
			return finishSaveInFlight();
		}
		const { hasName, hasOtherContent } = draftContent(state.draft);
		if (!hasName && hasOtherContent) {
			return new Promise<boolean>((resolve) => {
				themedAlert(
					"Item Name Required",
					"An Item cannot be saved with notes or quantity alone.",
					[
						{
							text: "Discard",
							style: "destructive",
							onPress: () => {
								dispatch({ type: "editingEnded" });
								input.onActiveChange(false);
								resolve(true);
							},
						},
						{
							text: "Keep Editing",
							onPress: () => {
								refocus();
								resolve(false);
							},
						},
					],
				);
			});
		}
		if (state.status === "details") {
			if (!canSaveDetails(state, input.listOptions) && hasName) return false;
			if (hasName) return performSave(state, "finish");
			dispatch({ type: "editingEnded" });
			input.onActiveChange(false);
			return true;
		}
		return saveInlineState(state, "finish");
	}

	function blurInlineEditor(refocus: () => void) {
		return finish(refocus);
	}

	async function saveDetails() {
		const { state, input } = getLatest();
		if (state.status !== "details") return;
		if (!canSaveDetails(state, input.listOptions)) return;
		await performSave(state, "finish");
	}

	async function deleteItem() {
		const { state, input } = getLatest();
		if (state.status !== "details" || state.source.kind !== "existing") return;
		const deletion = {
			itemId: state.source.itemId,
			listId: state.source.sourceListId,
		};
		dispatch({ type: "editingEnded" });
		input.onActiveChange(false);
		try {
			await input.onDeleteItem(deletion);
		} catch {
			toast.error("Unable to delete that Item. Please try again.");
		}
	}

	function selectList(listId: string) {
		if (!getLatest().input.listOptions.some((option) => option.id === listId))
			return;
		dispatch({ type: "listSelected", listId });
	}

	async function toggleItem(itemId: string) {
		const { state, input } = getLatest();
		if (state.status === "saving" || state.status === "details") return;
		const item = input.items.find((candidate) => candidate.id === itemId);
		if (!item) return;

		const editingThisItem =
			state.status === "inline" &&
			state.source.kind === "existing" &&
			state.source.itemId === itemId;
		if (editingThisItem) {
			const saved = await saveInlineState(state, "finish");
			if (!saved) return;
		}

		try {
			await input.onSetItemChecked(itemId, !item.checked);
			if (editingThisItem) {
				input.onActiveChange(false);
			}
		} catch {
			toast.error("Unable to save that completion change. Please try again.");
		}
	}

	return {
		startEditing,
		changeName: (value) => dispatch({ type: "nameChanged", value }),
		changeNotes: (value) => dispatch({ type: "notesChanged", value }),
		changeQuantity: (value) => dispatch({ type: "quantityChanged", value }),
		showNote: () => dispatch({ type: "noteRequested" }),
		submitTitle,
		blurInlineEditor,
		finish,
		openDetails: () => dispatch({ type: "detailsOpened" }),
		cancelDetails: () => dispatch({ type: "detailsCancelled" }),
		saveDetails,
		deleteItem,
		openListSelector: () => dispatch({ type: "listSelectorOpened" }),
		closeListSelector: () => dispatch({ type: "listSelectorClosed" }),
		selectList,
		toggleItem,
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

function draftContent(draft: ItemDraftValues): {
	hasName: boolean;
	hasOtherContent: boolean;
} {
	return {
		hasName: draft.name.trim().length > 0,
		hasOtherContent:
			draft.notes.trim().length > 0 || draft.quantity.trim().length > 0,
	};
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
