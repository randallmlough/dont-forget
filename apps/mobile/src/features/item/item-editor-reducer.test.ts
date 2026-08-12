import {
	detailsPresentationFromState,
	type ItemEditorAction,
	type ItemEditorState,
	initialItemEditorState,
	inlinePresentationFromState,
	itemEditorReducer,
} from "./item-editor-reducer";
import type { ActiveListItem } from "./item-view-types";

const milk: ActiveListItem = {
	id: "itm_milk",
	name: "Milk",
	quantity: null,
	notes: null,
	checked: false,
	checkedByMemberName: null,
};

describe("itemEditorReducer", () => {
	it("starts creation, updates the inline draft, and advances its key when editing ends", () => {
		const editing = reduce(initialItemEditorState, [
			{ type: "creationStarted", listId: "lst_groceries" },
			{ type: "nameChanged", value: "Milk" },
			{ type: "quantityChanged", value: "2" },
			{ type: "notesChanged", value: "Whole" },
			{ type: "noteRequested" },
		]);

		expect(editing).toEqual({
			status: "inline",
			source: { kind: "new", draftKey: 0 },
			draft: {
				name: "Milk",
				quantity: "2",
				notes: "Whole",
				selectedListId: "lst_groceries",
			},
			noteVisible: true,
		});

		const ended = itemEditorReducer(editing, { type: "editingEnded" });
		expect(ended).toEqual({ status: "idle", nextDraftKey: 1 });
		expect(
			itemEditorReducer(ended, {
				type: "creationStarted",
				listId: "lst_pantry",
			}),
		).toEqual({
			status: "inline",
			source: { kind: "new", draftKey: 1 },
			draft: {
				name: "",
				quantity: "",
				notes: "",
				selectedListId: "lst_pantry",
			},
			noteVisible: false,
		});
	});

	it("starts an existing Item edit from its persisted values", () => {
		const item = { ...milk, quantity: "2", notes: "" };

		expect(
			itemEditorReducer(initialItemEditorState, {
				type: "editingStarted",
				item,
				listId: "lst_groceries",
			}),
		).toEqual({
			status: "inline",
			source: {
				kind: "existing",
				itemId: "itm_milk",
				sourceListId: "lst_groceries",
			},
			draft: {
				name: "Milk",
				quantity: "2",
				notes: "",
				selectedListId: "lst_groceries",
			},
			noteVisible: true,
		});
	});

	it("cancels Details to the original inline draft and preserves an empty visible note", () => {
		const inline = reduce(initialItemEditorState, [
			{ type: "creationStarted", listId: "lst_groceries" },
			{ type: "nameChanged", value: "Coffee" },
			{ type: "noteRequested" },
		]);
		const details = itemEditorReducer(inline, { type: "detailsOpened" });

		expect(details).toEqual({
			status: "details",
			source: { kind: "new", draftKey: 0 },
			inlineDraft: {
				name: "Coffee",
				quantity: "",
				notes: "",
				selectedListId: "lst_groceries",
			},
			inlineNoteVisible: true,
			draft: {
				name: "Coffee",
				quantity: "",
				notes: "",
				selectedListId: "lst_groceries",
			},
			listSelectorPresented: false,
		});
		expect(inlinePresentationFromState(details)).toMatchObject({
			noteVisible: true,
		});

		const changedDetails = reduce(details, [
			{ type: "nameChanged", value: "Discarded name" },
			{ type: "notesChanged", value: "Discarded note" },
		]);
		expect(
			itemEditorReducer(changedDetails, { type: "detailsCancelled" }),
		).toEqual(inline);
	});

	it("opens, selects from, and closes the List selector in Details", () => {
		const details = reduce(initialItemEditorState, [
			{ type: "creationStarted", listId: "lst_groceries" },
			{ type: "detailsOpened" },
		]);
		const opened = itemEditorReducer(details, {
			type: "listSelectorOpened",
		});
		expect(opened).toMatchObject({ listSelectorPresented: true });

		const selected = itemEditorReducer(opened, {
			type: "listSelected",
			listId: "lst_pantry",
		});
		expect(selected).toMatchObject({
			draft: { selectedListId: "lst_pantry" },
			listSelectorPresented: false,
		});

		const reopened = itemEditorReducer(selected, {
			type: "listSelectorOpened",
		});
		expect(itemEditorReducer(reopened, { type: "listSelectorClosed" })).toEqual(
			selected,
		);
	});

	it("starts and succeeds an inline save with create-next and finish continuations", () => {
		const inline = reduce(initialItemEditorState, [
			{ type: "creationStarted", listId: "lst_groceries" },
			{ type: "nameChanged", value: "Milk" },
		]);
		const savingNext = itemEditorReducer(inline, {
			type: "saveStarted",
			continuation: "createNext",
		});

		expect(savingNext).toEqual({
			status: "saving",
			source: { kind: "new", draftKey: 0 },
			draft: {
				name: "Milk",
				quantity: "",
				notes: "",
				selectedListId: "lst_groceries",
			},
			continuation: "createNext",
			recovery: { kind: "inline", noteVisible: false },
			nextDraftKey: 1,
		});
		expect(
			itemEditorReducer(savingNext, {
				type: "saveSucceeded",
				nextListId: "lst_pantry",
			}),
		).toEqual({
			status: "inline",
			source: { kind: "new", draftKey: 2 },
			draft: {
				name: "",
				quantity: "",
				notes: "",
				selectedListId: "lst_pantry",
			},
			noteVisible: false,
		});

		const savingFinish = itemEditorReducer(inline, {
			type: "saveStarted",
			continuation: "finish",
		});
		expect(
			itemEditorReducer(savingFinish, {
				type: "saveSucceeded",
				nextListId: "lst_groceries",
			}),
		).toEqual({ status: "idle", nextDraftKey: 2 });
	});

	it("upgrades create-next to finish and restores the inline draft after failure", () => {
		const inline = reduce(initialItemEditorState, [
			{ type: "creationStarted", listId: "lst_groceries" },
			{ type: "nameChanged", value: "Milk" },
			{ type: "noteRequested" },
		]);
		const saving = itemEditorReducer(inline, {
			type: "saveStarted",
			continuation: "createNext",
		});
		const finishing = itemEditorReducer(saving, {
			type: "finishRequested",
		});

		expect(finishing).toMatchObject({
			status: "saving",
			continuation: "finish",
		});
		expect(itemEditorReducer(finishing, { type: "saveFailed" })).toEqual(
			inline,
		);
	});

	it("restores Details and its inline draft after a failed save", () => {
		const inline = reduce(initialItemEditorState, [
			{ type: "creationStarted", listId: "lst_groceries" },
			{ type: "nameChanged", value: "Coffee" },
			{ type: "noteRequested" },
		]);
		const details = reduce(inline, [
			{ type: "detailsOpened" },
			{ type: "nameChanged", value: "Espresso" },
			{ type: "quantityChanged", value: "2 bags" },
			{ type: "listSelectorOpened" },
		]);
		const saving = itemEditorReducer(details, {
			type: "saveStarted",
			continuation: "createNext",
		});

		expect(saving).toMatchObject({
			status: "saving",
			continuation: "finish",
			recovery: {
				kind: "details",
				inlineDraft: {
					name: "Coffee",
					selectedListId: "lst_groceries",
				},
				inlineNoteVisible: true,
			},
		});
		expect(detailsPresentationFromState(saving)).toMatchObject({
			draft: {
				name: "Espresso",
				quantity: "2 bags",
			},
			listSelectorPresented: false,
			saving: true,
		});

		const recovered = itemEditorReducer(saving, { type: "saveFailed" });
		expect(recovered).toEqual({
			...details,
			listSelectorPresented: false,
		});
		expect(inlinePresentationFromState(recovered)).toMatchObject({
			draft: {
				name: "Coffee",
				quantity: "",
				notes: "",
				selectedListId: "lst_groceries",
			},
			noteVisible: true,
		});
	});

	it("ignores actions that do not apply to the current state", () => {
		expect(
			itemEditorReducer(initialItemEditorState, {
				type: "nameChanged",
				value: "Ignored",
			}),
		).toBe(initialItemEditorState);
		expect(
			itemEditorReducer(initialItemEditorState, {
				type: "saveSucceeded",
				nextListId: "lst_groceries",
			}),
		).toBe(initialItemEditorState);

		const inline = itemEditorReducer(initialItemEditorState, {
			type: "creationStarted",
			listId: "lst_groceries",
		});
		expect(itemEditorReducer(inline, { type: "listSelectorOpened" })).toBe(
			inline,
		);

		const saving = itemEditorReducer(inline, {
			type: "saveStarted",
			continuation: "finish",
		});
		expect(
			itemEditorReducer(saving, {
				type: "saveStarted",
				continuation: "createNext",
			}),
		).toBe(saving);
		expect(itemEditorReducer(saving, { type: "finishRequested" })).toBe(saving);
	});
});

function reduce(
	state: ItemEditorState,
	actions: readonly ItemEditorAction[],
): ItemEditorState {
	return actions.reduce(itemEditorReducer, state);
}
