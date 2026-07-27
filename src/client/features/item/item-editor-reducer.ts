import type { ActiveListItem, ItemDraftValues } from "./item-view-types";

export type ItemEditorSource =
	| { kind: "new"; draftKey: number }
	| {
			kind: "existing";
			itemId: string;
			sourceListId: string;
	  };

export type ItemEditorInlineState = {
	status: "inline";
	source: ItemEditorSource;
	draft: ItemDraftValues;
	noteVisible: boolean;
};

export type ItemEditorDetailsState = {
	status: "details";
	source: ItemEditorSource;
	inlineDraft: ItemDraftValues;
	draft: ItemDraftValues;
	listSelectorPresented: boolean;
};

type ItemEditorSavingRecovery =
	| {
			kind: "inline";
			noteVisible: boolean;
	  }
	| {
			kind: "details";
			inlineDraft: ItemDraftValues;
	  };

export type ItemEditorState =
	| { status: "idle"; nextDraftKey: number }
	| ItemEditorInlineState
	| ItemEditorDetailsState
	| {
			status: "saving";
			source: ItemEditorSource;
			draft: ItemDraftValues;
			continuation: "createNext" | "finish";
			recovery: ItemEditorSavingRecovery;
			nextDraftKey: number;
	  };

export type ItemEditorAction =
	| { type: "creationStarted"; listId: string }
	| { type: "editingStarted"; item: ActiveListItem; listId: string }
	| { type: "nameChanged"; value: string }
	| { type: "notesChanged"; value: string }
	| { type: "quantityChanged"; value: string }
	| { type: "noteRequested" }
	| { type: "detailsOpened" }
	| { type: "detailsCancelled" }
	| { type: "listSelectorOpened" }
	| { type: "listSelectorClosed" }
	| { type: "listSelected"; listId: string }
	| {
			type: "saveStarted";
			continuation: "createNext" | "finish";
	  }
	| { type: "saveSucceeded"; nextListId: string }
	| { type: "saveFailed" }
	| { type: "editingEnded" };

export const initialItemEditorState: ItemEditorState = {
	status: "idle",
	nextDraftKey: 0,
};

export function itemEditorReducer(
	state: ItemEditorState,
	action: ItemEditorAction,
): ItemEditorState {
	switch (action.type) {
		case "creationStarted": {
			const nextDraftKey =
				state.status === "idle" || state.status === "saving"
					? state.nextDraftKey
					: nextDraftKeyFromSource(state.source);
			return {
				status: "inline",
				source: { kind: "new", draftKey: nextDraftKey },
				draft: emptyDraft(action.listId),
				noteVisible: false,
			};
		}
		case "editingStarted":
			return {
				status: "inline",
				source: {
					kind: "existing",
					itemId: action.item.id,
					sourceListId: action.listId,
				},
				draft: {
					name: action.item.name,
					quantity: action.item.quantity ?? "",
					notes: action.item.notes ?? "",
					selectedListId: action.listId,
				},
				noteVisible: action.item.notes !== null,
			};
		case "nameChanged":
			return updateDraft(state, { name: action.value });
		case "notesChanged":
			return updateDraft(state, { notes: action.value });
		case "quantityChanged":
			return updateDraft(state, { quantity: action.value });
		case "noteRequested":
			return state.status === "inline"
				? { ...state, noteVisible: true }
				: state;
		case "detailsOpened":
			return state.status === "inline"
				? {
						status: "details",
						source: state.source,
						inlineDraft: state.draft,
						draft: state.draft,
						listSelectorPresented: false,
					}
				: state;
		case "detailsCancelled":
			return state.status === "details"
				? {
						status: "inline",
						source: state.source,
						draft: state.inlineDraft,
						noteVisible: state.inlineDraft.notes.length > 0,
					}
				: state;
		case "listSelectorOpened":
			return state.status === "details"
				? { ...state, listSelectorPresented: true }
				: state;
		case "listSelectorClosed":
			return state.status === "details"
				? { ...state, listSelectorPresented: false }
				: state;
		case "listSelected":
			return state.status === "details"
				? {
						...state,
						draft: { ...state.draft, selectedListId: action.listId },
						listSelectorPresented: false,
					}
				: state;
		case "saveStarted": {
			if (state.status === "inline") {
				return {
					status: "saving",
					source: state.source,
					draft: state.draft,
					continuation: action.continuation,
					recovery: {
						kind: "inline",
						noteVisible: state.noteVisible,
					},
					nextDraftKey: nextDraftKeyFromSource(state.source),
				};
			}
			if (state.status === "details") {
				return {
					status: "saving",
					source: state.source,
					draft: state.draft,
					continuation: "finish",
					recovery: {
						kind: "details",
						inlineDraft: state.inlineDraft,
					},
					nextDraftKey: nextDraftKeyFromSource(state.source),
				};
			}
			return state;
		}
		case "saveSucceeded":
			if (state.status !== "saving") return state;
			if (state.continuation === "finish") {
				return {
					status: "idle",
					nextDraftKey: state.nextDraftKey + 1,
				};
			}
			return {
				status: "inline",
				source: { kind: "new", draftKey: state.nextDraftKey + 1 },
				draft: emptyDraft(action.nextListId),
				noteVisible: false,
			};
		case "saveFailed":
			if (state.status !== "saving") return state;
			if (state.recovery.kind === "inline") {
				return {
					status: "inline",
					source: state.source,
					draft: state.draft,
					noteVisible: state.recovery.noteVisible,
				};
			}
			return {
				status: "details",
				source: state.source,
				inlineDraft: state.recovery.inlineDraft,
				draft: state.draft,
				listSelectorPresented: false,
			};
		case "editingEnded":
			return {
				status: "idle",
				nextDraftKey:
					state.status === "idle"
						? state.nextDraftKey
						: nextDraftKeyFromSource(state.source),
			};
	}
}

function updateDraft(
	state: ItemEditorState,
	change: Partial<Pick<ItemDraftValues, "name" | "notes" | "quantity">>,
): ItemEditorState {
	if (state.status !== "inline" && state.status !== "details") return state;
	return { ...state, draft: { ...state.draft, ...change } };
}

function emptyDraft(listId: string): ItemDraftValues {
	return {
		name: "",
		quantity: "",
		notes: "",
		selectedListId: listId,
	};
}

function nextDraftKeyFromSource(source: ItemEditorSource): number {
	return source.kind === "new" ? source.draftKey + 1 : 0;
}
