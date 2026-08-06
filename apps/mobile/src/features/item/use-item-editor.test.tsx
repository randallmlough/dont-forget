import { act, renderHook } from "@testing-library/react-native";
import { themedAlert } from "@mobile/ui/native-dialogs";
import { toast } from "@mobile/ui/toast";
import { deferred } from "@mobile/test/async";
import type { ActiveListItem } from "./item-view-types";
import { type UseItemEditorInput, useItemEditor } from "./use-item-editor";

jest.mock("@mobile/ui/native-dialogs", () => ({
	themedAlert: jest.fn(),
}));
jest.mock("@mobile/ui/toast", () => ({
	toast: { error: jest.fn() },
}));

const milk: ActiveListItem = {
	id: "itm_milk",
	name: "Milk",
	quantity: null,
	notes: null,
	checked: false,
	checkedByMemberName: null,
};

describe("useItemEditor", () => {
	afterEach(() => {
		jest.clearAllMocks();
	});

	it("saves a new inline Item on Return and readies the next draft", async () => {
		const input = editorInput({ creationRequestKey: 1 });
		const { result } = await renderHook(() => useItemEditor(input));

		await act(async () => {
			result.current.actions.changeName(" Milk ");
		});
		await act(async () => {
			await result.current.actions.submitTitle();
		});

		expect(input.onAddItem).toHaveBeenCalledWith({
			listId: "lst_groceries",
			name: "Milk",
			quantity: null,
			notes: null,
		});
		expect(result.current.state).toMatchObject({
			status: "inline",
			source: { kind: "new" },
			draft: { name: "", selectedListId: "lst_groceries" },
		});
		expect(input.onActiveChange).not.toHaveBeenCalledWith(false);
	});

	it("updates an existing Item on Return and continues with a new draft", async () => {
		const input = editorInput({ items: [milk] });
		const { result } = await renderHook(() => useItemEditor(input));

		await act(async () => {
			await result.current.actions.startEditing("itm_milk");
		});
		await act(async () => {
			result.current.actions.changeName("Oat milk");
		});
		await act(async () => {
			await result.current.actions.submitTitle();
		});

		expect(input.onUpdateItem).toHaveBeenCalledWith({
			itemId: "itm_milk",
			sourceListId: "lst_groceries",
			destinationListId: "lst_groceries",
			name: "Oat milk",
			quantity: null,
			notes: null,
		});
		expect(result.current.state).toMatchObject({
			status: "inline",
			source: { kind: "new" },
			draft: { name: "" },
		});
	});

	it("upgrades an in-flight Return save when blur requests finish", async () => {
		const save = deferred<void>();
		const input = editorInput({
			creationRequestKey: 1,
			onAddItem: jest.fn(() => save.promise),
		});
		const { result } = await renderHook(() => useItemEditor(input));

		await act(async () => {
			result.current.actions.changeName("Milk");
		});
		await act(async () => {
			const returnSave = result.current.actions.submitTitle();
			const blurSave = result.current.actions.blurInlineEditor(jest.fn());
			expect(input.onAddItem).toHaveBeenCalledTimes(1);
			save.resolve(undefined);
			await Promise.all([returnSave, blurSave]);
		});

		expect(input.onAddItem).toHaveBeenCalledTimes(1);
		expect(result.current.state.status).toBe("idle");
		expect(input.onActiveChange).toHaveBeenLastCalledWith(false);
	});

	it("acknowledges a creation request only when the idle editor accepts it", async () => {
		const onCreationRequestAcknowledged = jest.fn();
		const input = editorInput({
			items: [milk],
			onCreationRequestAcknowledged,
		});
		let currentInput = input;
		const { result, rerender } = await renderHook(() =>
			useItemEditor(currentInput),
		);
		await act(async () => {
			await result.current.actions.startEditing("itm_milk");
		});

		const requestedInput = { ...input, creationRequestKey: 1 };
		currentInput = requestedInput;
		await rerender(undefined);
		expect(onCreationRequestAcknowledged).not.toHaveBeenCalled();

		await act(async () => {
			result.current.actions.changeName("");
			await result.current.actions.finish();
		});

		expect(onCreationRequestAcknowledged).toHaveBeenCalledWith(1);
		expect(requestedInput.onActiveChange).toHaveBeenLastCalledWith(true);
		expect(result.current.state).toMatchObject({
			status: "inline",
			source: { kind: "new" },
		});
	});

	it("replaces an untouched creation draft when an existing Item is tapped", async () => {
		const input = editorInput({ creationRequestKey: 1, items: [milk] });
		const { result } = await renderHook(() => useItemEditor(input));

		await act(async () => {
			await result.current.actions.startEditing("itm_milk");
		});

		expect(result.current.state).toMatchObject({
			status: "inline",
			source: { kind: "existing", itemId: "itm_milk" },
			draft: { name: "Milk" },
		});
		expect(input.onAddItem).not.toHaveBeenCalled();
	});

	it("saves details to the selected List and finishes creation", async () => {
		const input = editorInput({ creationRequestKey: 1 });
		const { result } = await renderHook(() => useItemEditor(input));

		await act(async () => {
			result.current.actions.changeName("Coffee");
			result.current.actions.openDetails();
		});
		await act(async () => {
			result.current.actions.changeQuantity("2 bags");
			result.current.actions.openListSelector();
			result.current.actions.selectList("lst_pantry");
		});
		await act(async () => {
			await result.current.actions.saveDetails();
		});

		expect(input.onAddItem).toHaveBeenCalledWith({
			listId: "lst_pantry",
			name: "Coffee",
			quantity: "2 bags",
			notes: null,
		});
		expect(result.current.state.status).toBe("idle");
		expect(input.onActiveChange).toHaveBeenLastCalledWith(false);
	});

	it("cancels details back to the unchanged inline draft", async () => {
		const input = editorInput({ creationRequestKey: 1 });
		const { result } = await renderHook(() => useItemEditor(input));

		await act(async () => {
			result.current.actions.changeName("Coffee");
			result.current.actions.showNote();
			result.current.actions.openDetails();
		});
		await act(async () => {
			result.current.actions.changeName("Discard this");
			result.current.actions.cancelDetails();
		});

		expect(result.current.state).toMatchObject({
			status: "inline",
			draft: { name: "Coffee" },
			noteVisible: true,
		});
	});

	it("restores a new inline Item draft when adding fails", async () => {
		const input = editorInput({
			creationRequestKey: 1,
			onAddItem: jest.fn(async () => {
				throw new Error("add failed");
			}),
		});
		const { result } = await renderHook(() => useItemEditor(input));

		await act(async () => {
			result.current.actions.changeName("Coffee");
			result.current.actions.changeQuantity("2 bags");
			result.current.actions.showNote();
		});
		await act(async () => {
			await result.current.actions.submitTitle();
		});

		expect(result.current.state).toEqual({
			status: "inline",
			source: { kind: "new", draftKey: 0 },
			draft: {
				name: "Coffee",
				quantity: "2 bags",
				notes: "",
				selectedListId: "lst_groceries",
			},
			noteVisible: true,
		});
		expect(toast.error).toHaveBeenCalledWith(
			"Unable to add that Item. Please try again.",
		);
		expect(input.onActiveChange).not.toHaveBeenCalledWith(false);
	});

	it("restores an existing inline Item draft when updating fails", async () => {
		const input = editorInput({
			items: [milk],
			onUpdateItem: jest.fn(async () => {
				throw new Error("update failed");
			}),
		});
		const { result } = await renderHook(() => useItemEditor(input));

		await act(async () => {
			await result.current.actions.startEditing("itm_milk");
			result.current.actions.changeName("Oat milk");
			result.current.actions.changeQuantity("2");
			result.current.actions.showNote();
			result.current.actions.changeNotes("Unsweetened");
		});
		await act(async () => {
			await result.current.actions.submitTitle();
		});

		expect(result.current.state).toEqual({
			status: "inline",
			source: {
				kind: "existing",
				itemId: "itm_milk",
				sourceListId: "lst_groceries",
			},
			draft: {
				name: "Oat milk",
				quantity: "2",
				notes: "Unsweetened",
				selectedListId: "lst_groceries",
			},
			noteVisible: true,
		});
		expect(toast.error).toHaveBeenCalledWith(
			"Unable to update that Item. Please try again.",
		);
		expect(input.onActiveChange).not.toHaveBeenCalledWith(false);
	});

	it("restores Details and both drafts when moving an Item fails", async () => {
		const input = editorInput({
			items: [milk],
			onUpdateItem: jest.fn(async () => {
				throw new Error("move failed");
			}),
		});
		const { result } = await renderHook(() => useItemEditor(input));

		await act(async () => {
			await result.current.actions.startEditing("itm_milk");
			result.current.actions.openDetails();
		});
		await act(async () => {
			result.current.actions.changeName("Oat milk");
			result.current.actions.changeQuantity("2");
			result.current.actions.changeNotes("Unsweetened");
			result.current.actions.openListSelector();
			result.current.actions.selectList("lst_pantry");
		});
		await act(async () => {
			await result.current.actions.saveDetails();
		});

		expect(result.current.state).toEqual({
			status: "details",
			source: {
				kind: "existing",
				itemId: "itm_milk",
				sourceListId: "lst_groceries",
			},
			inlineDraft: {
				name: "Milk",
				quantity: "",
				notes: "",
				selectedListId: "lst_groceries",
			},
			inlineNoteVisible: false,
			draft: {
				name: "Oat milk",
				quantity: "2",
				notes: "Unsweetened",
				selectedListId: "lst_pantry",
			},
			listSelectorPresented: false,
		});
		expect(toast.error).toHaveBeenCalledWith(
			"Unable to move that Item. Please try again.",
		);
		expect(input.onActiveChange).not.toHaveBeenCalledWith(false);
	});

	it("resets editing when the active Item vanishes", async () => {
		const input = editorInput({ items: [milk] });
		let currentInput = input;
		const { result, rerender } = await renderHook(() =>
			useItemEditor(currentInput),
		);

		await act(async () => {
			await result.current.actions.startEditing("itm_milk");
			result.current.actions.changeName("Oat milk");
		});
		currentInput = { ...input, items: [] };
		await rerender(undefined);

		expect(result.current.state).toEqual({
			status: "idle",
			nextDraftKey: 0,
		});
		expect(input.onActiveChange).toHaveBeenLastCalledWith(false);
		expect(toast.error).toHaveBeenCalledWith(
			"That Item is no longer available in this List.",
		);
	});

	it("closes Details before deleting an existing Item", async () => {
		const deletion = deferred<void>();
		const input = editorInput({
			items: [milk],
			onDeleteItem: jest.fn(() => deletion.promise),
		});
		const { result } = await renderHook(() => useItemEditor(input));

		await act(async () => {
			await result.current.actions.startEditing("itm_milk");
			result.current.actions.openDetails();
		});
		let request: Promise<void> | undefined;
		await act(async () => {
			request = result.current.actions.deleteItem();
		});

		expect(input.onDeleteItem).toHaveBeenCalledWith({
			itemId: "itm_milk",
			listId: "lst_groceries",
		});
		expect(result.current.state.status).toBe("idle");
		expect(input.onActiveChange).toHaveBeenLastCalledWith(false);

		await act(async () => {
			deletion.resolve();
			await request;
		});
		expect(toast.error).not.toHaveBeenCalled();
	});

	it("reports an Item deletion failure after closing Details", async () => {
		const input = editorInput({
			items: [milk],
			onDeleteItem: jest.fn(async () => {
				throw new Error("delete failed");
			}),
		});
		const { result } = await renderHook(() => useItemEditor(input));

		await act(async () => {
			await result.current.actions.startEditing("itm_milk");
			result.current.actions.openDetails();
		});
		await act(async () => {
			await result.current.actions.deleteItem();
		});

		expect(result.current.state.status).toBe("idle");
		expect(toast.error).toHaveBeenCalledWith(
			"Unable to delete that Item. Please try again.",
		);
	});

	it("asks before discarding notes without an Item name", async () => {
		const input = editorInput({ creationRequestKey: 1 });
		const { result } = await renderHook(() => useItemEditor(input));
		const refocus = jest.fn();

		await act(async () => {
			result.current.actions.changeNotes("Remember this");
		});
		let finishResult: Promise<boolean> | undefined;
		await act(async () => {
			finishResult = result.current.actions.blurInlineEditor(refocus);
		});

		expect(themedAlert).toHaveBeenCalledWith(
			"Item Name Required",
			"An Item cannot be saved with notes or quantity alone.",
			expect.any(Array),
		);
		const buttons = jest.mocked(themedAlert).mock.calls[0]?.[2];
		const keepEditing = buttons?.find(
			(button) => button.text === "Keep Editing",
		);

		await act(async () => {
			keepEditing?.onPress?.();
		});
		await expect(finishResult).resolves.toBe(false);
		expect(refocus).toHaveBeenCalledTimes(1);

		await act(async () => {
			finishResult = result.current.actions.blurInlineEditor(refocus);
		});
		const secondButtons = jest.mocked(themedAlert).mock.calls[1]?.[2];
		const secondDiscard = secondButtons?.find(
			(button) => button.text === "Discard",
		);
		await act(async () => {
			secondDiscard?.onPress?.();
		});
		await expect(finishResult).resolves.toBe(true);
		expect(result.current.state.status).toBe("idle");
		expect(input.onAddItem).not.toHaveBeenCalled();
	});

	it("keeps completion separate from editing", async () => {
		const input = editorInput({ items: [milk] });
		const { result } = await renderHook(() => useItemEditor(input));

		await act(async () => {
			await result.current.actions.toggleItem("itm_milk");
		});

		expect(input.onSetItemChecked).toHaveBeenCalledWith("itm_milk", true);
		expect(input.onUpdateItem).not.toHaveBeenCalled();
		expect(result.current.state.status).toBe("idle");
	});

	it("shows the completion-specific error when toggling fails", async () => {
		const input = editorInput({
			items: [milk],
			onSetItemChecked: jest.fn(async () => {
				throw new Error("toggle failed");
			}),
		});
		const { result } = await renderHook(() => useItemEditor(input));

		await act(async () => {
			await result.current.actions.toggleItem("itm_milk");
		});

		expect(input.onSetItemChecked).toHaveBeenCalledWith("itm_milk", true);
		expect(toast.error).toHaveBeenCalledWith(
			"Unable to save that completion change. Please try again.",
		);
		expect(result.current.state.status).toBe("idle");
	});
});

function editorInput(
	overrides: Partial<UseItemEditorInput> = {},
): UseItemEditorInput {
	return {
		currentListId: "lst_groceries",
		items: [],
		listOptions: [
			{ id: "lst_groceries", name: "Groceries" },
			{ id: "lst_pantry", name: "Pantry" },
		],
		creationRequestKey: null,
		onAddItem: jest.fn(async () => undefined),
		onUpdateItem: jest.fn(async () => undefined),
		onDeleteItem: jest.fn(async () => undefined),
		onSetItemChecked: jest.fn(async () => undefined),
		onActiveChange: jest.fn(),
		...overrides,
	};
}
