import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react-native";
import type { ReactElement } from "react";
import { View } from "react-native";
import type {
	AddListItemInput,
	UpdateListItemInput,
} from "@/client/features/item/item-view-types";
import { useItemEditor } from "@/client/features/item/use-item-editor";
import { TestSafeAreaProvider } from "@/test/safe-area";
import { ListItems } from "./list-items";
import { ListOverview } from "./list-overview";
import {
	emptyActiveListState,
	largeActiveListState,
	populatedActiveListState,
} from "./list-test-support";
import type { ActiveListMeta, ActiveListState } from "./list-view-types";

describe("List parts", () => {
	it("renders overview progress for an empty List", async () => {
		await renderWithSafeArea(
			<ListOverview state={emptyActiveListState} meta={meta()} />,
		);

		expect(await screen.findByText("No Items yet")).toBeTruthy();
	});

	it("renders overview progress for a partially checked List", async () => {
		await renderWithSafeArea(
			<ListOverview state={populatedActiveListState} meta={meta()} />,
		);

		expect(await screen.findByText("1 of 3 Items checked")).toBeTruthy();
	});

	it("renders overview progress for a fully checked List", async () => {
		await renderWithSafeArea(
			<ListOverview
				state={withCheckedItems(populatedActiveListState)}
				meta={meta()}
			/>,
		);

		expect(await screen.findByText("3 of 3 Items checked")).toBeTruthy();
	});

	it.each([
		["synced", "Synced"],
		["pending", "Pending sync"],
		["offline", "Offline - changes saved locally"],
		["failed", "Sync failed - changes saved locally"],
	] satisfies [
		ActiveListMeta["syncState"],
		string,
	][])("renders %s sync status", async (syncState, label) => {
		await renderWithSafeArea(
			<ListOverview state={populatedActiveListState} meta={meta(syncState)} />,
		);

		expect(await screen.findByText(label)).toBeTruthy();
	});

	it("edits Item text inline without changing completion", async () => {
		const onSetItemChecked = jest.fn(async () => undefined);
		await renderWithSafeArea(
			<TestListItems onSetItemChecked={onSetItemChecked} />,
		);

		await fireEvent.press(
			await screen.findByRole("button", { name: "Edit Milk" }),
		);

		expect(await screen.findByLabelText("Item name")).toHaveDisplayValue(
			"Milk",
		);
		expect(onSetItemChecked).not.toHaveBeenCalled();
	});

	it("changes completion only from the separate circle", async () => {
		const onSetItemChecked = jest.fn(async () => undefined);
		await renderWithSafeArea(
			<TestListItems onSetItemChecked={onSetItemChecked} />,
		);

		await fireEvent.press(
			await screen.findByRole("checkbox", { name: "Milk" }),
		);

		await waitFor(() => {
			expect(onSetItemChecked).toHaveBeenCalledWith("item-1", true);
		});
		expect(screen.queryByLabelText("Item name")).toBeNull();
	});

	it("starts inline creation and Return saves then readies another draft", async () => {
		const onAddItem = jest.fn(async () => undefined);
		await renderWithSafeArea(
			<TestListItems creationRequestKey={1} onAddItem={onAddItem} />,
		);

		const nameInput = await screen.findByLabelText("Item name");
		await fireEvent.changeText(nameInput, " Milk ");
		await fireEvent(nameInput, "submitEditing");

		await waitFor(() => {
			expect(onAddItem).toHaveBeenCalledWith({
				listId: "lst_groceries",
				name: "Milk",
				quantity: null,
				notes: null,
			});
		});
		expect(await screen.findByLabelText("Item name")).toHaveDisplayValue("");
	});

	it("supports optional inline notes", async () => {
		await renderWithSafeArea(<TestListItems creationRequestKey={1} />);

		await fireEvent.press(
			await screen.findByRole("button", { name: "Add Note" }),
		);

		expect(await screen.findByLabelText("Item notes")).toBeTruthy();
	});

	it("saves details through the stacked List selector without starting another draft", async () => {
		const onAddItem = jest.fn(async () => undefined);
		await renderWithSafeArea(
			<TestListItems creationRequestKey={1} onAddItem={onAddItem} />,
		);
		await fireEvent.changeText(
			await screen.findByLabelText("Item name"),
			"Coffee",
		);
		await fireEvent.press(
			await screen.findByRole("button", { name: "Item Details" }),
		);

		const details = await screen.findByTestId("item-details-sheet");
		expect(
			within(details).getByRole("header", { name: "Details" }),
		).toBeTruthy();
		await fireEvent.press(
			within(details).getByRole("button", { name: "List, Groceries" }),
		);

		const selector = await screen.findByTestId("item-list-selector-sheet");
		expect(
			within(selector).getByRole("radio", {
				name: "Groceries, Selected",
			}),
		).toBeTruthy();
		await fireEvent.press(
			within(selector).getByRole("radio", { name: "Pantry" }),
		);
		await fireEvent.press(
			within(details).getByRole("button", { name: "Save Item" }),
		);

		await waitFor(() => {
			expect(onAddItem).toHaveBeenCalledWith({
				listId: "lst_pantry",
				name: "Coffee",
				quantity: null,
				notes: null,
			});
		});
		expect(screen.queryByLabelText("Item name")).toBeNull();
	});

	it("marks an existing Item's source List as Current", async () => {
		await renderWithSafeArea(<TestListItems />);
		await fireEvent.press(
			await screen.findByRole("button", { name: "Edit Milk" }),
		);
		await fireEvent.press(
			await screen.findByRole("button", { name: "Item Details" }),
		);
		const details = await screen.findByTestId("item-details-sheet");
		await fireEvent.press(
			within(details).getByRole("button", { name: "List, Groceries" }),
		);

		const selector = await screen.findByTestId("item-list-selector-sheet");
		expect(
			within(selector).getByRole("radio", {
				name: "Groceries, Current, Selected",
			}),
		).toBeTruthy();
		expect(within(selector).getByText("Current")).toBeTruthy();
	});

	it("renders the empty List state without making its body an add target", async () => {
		await renderWithSafeArea(
			<TestListItems initialState={emptyActiveListState} />,
		);

		expect(await screen.findByText("Tap + to add an Item.")).toBeTruthy();
		expect(screen.queryByLabelText("Item name")).toBeNull();
	});

	it("renders a larger List with long names and checked attribution", async () => {
		await renderWithSafeArea(
			<TestListItems initialState={largeActiveListState} />,
		);

		expect(
			await screen.findByText(
				"Extra long Item name that should stay readable in the List row",
			),
		).toBeTruthy();
		expect(
			await screen.findAllByText("Checked by Avery Chen"),
		).not.toHaveLength(0);
	});
});

type TestListItemsProps = {
	initialState?: ActiveListState;
	creationRequestKey?: number | null;
	onAddItem?: (input: AddListItemInput) => Promise<void>;
	onUpdateItem?: (input: UpdateListItemInput) => Promise<void>;
	onSetItemChecked?: (itemId: string, checked: boolean) => Promise<void>;
};

function TestListItems({
	initialState = populatedActiveListState,
	creationRequestKey = null,
	onAddItem = async () => undefined,
	onUpdateItem = async () => undefined,
	onSetItemChecked = async () => undefined,
}: TestListItemsProps) {
	const editor = useItemEditor({
		currentListId: "lst_groceries",
		items: initialState.items,
		listOptions: [
			{ id: "lst_groceries", name: "Groceries" },
			{ id: "lst_pantry", name: "Pantry" },
		],
		creationRequestKey,
		onAddItem,
		onUpdateItem,
		onSetItemChecked,
		onActiveChange: () => undefined,
	});

	return <ListItems editor={editor} items={initialState.items} />;
}

function renderWithSafeArea(element: ReactElement) {
	return render(<View style={{ flex: 1 }}>{element}</View>, {
		wrapper: TestSafeAreaProvider,
	});
}

function meta(
	syncState: ActiveListMeta["syncState"] = "synced",
): ActiveListMeta {
	return {
		currentMemberName: "Avery",
		syncState,
	};
}

function withCheckedItems(state: ActiveListState): ActiveListState {
	return {
		...state,
		items: state.items.map((item) => ({
			...item,
			checked: true,
		})),
	};
}
