import { act, renderHook } from "@testing-library/react-native";
import { themedAlert } from "@/client/ui/native-dialogs";
import { deferred } from "@/test/async";
import type { ActiveListItem } from "./item-view-types";
import { type UseItemEditorInput, useItemEditor } from "./use-item-editor";

jest.mock("@/client/ui/native-dialogs", () => ({
	themedAlert: jest.fn(),
}));
jest.mock("@/client/ui/toast", () => ({
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

	it("coalesces overlapping blur and Return saves", async () => {
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
			result.current.actions.openDetails();
		});
		await act(async () => {
			result.current.actions.changeName("Discard this");
			result.current.actions.cancelDetails();
		});

		expect(result.current.state).toMatchObject({
			status: "inline",
			draft: { name: "Coffee" },
		});
	});

	it("asks before discarding notes without an Item name", async () => {
		const input = editorInput({ creationRequestKey: 1 });
		const { result } = await renderHook(() => useItemEditor(input));
		const refocus = jest.fn();

		await act(async () => {
			result.current.actions.changeNotes("Remember this");
		});
		await act(async () => {
			await result.current.actions.blurInlineEditor(refocus);
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
		const discard = buttons?.find((button) => button.text === "Discard");

		keepEditing?.onPress?.();
		expect(refocus).toHaveBeenCalledTimes(1);
		await act(async () => {
			discard?.onPress?.();
		});
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
		onSetItemChecked: jest.fn(async () => undefined),
		onActiveChange: jest.fn(),
		...overrides,
	};
}
