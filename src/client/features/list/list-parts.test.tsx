import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react-native";
import type { ReactElement } from "react";
import { FlatList, View } from "react-native";
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

	it("dismisses an empty creation draft from the List background", async () => {
		await renderWithSafeArea(
			<TestListItems
				creationRequestKey={1}
				listOverview={<View testID="test-list-overview" />}
			/>,
		);

		await screen.findByLabelText("Item name");
		await fireEvent.press(screen.getByTestId("list-overview-dismiss-target"));

		expect(screen.queryByLabelText("Item name")).toBeNull();
	});

	it("keeps the focused Item visible when the keyboard changes", async () => {
		await renderWithSafeArea(<TestListItems creationRequestKey={1} />);

		expect(screen.getByTestId("test-list-items")).toHaveProp(
			"automaticallyAdjustKeyboardInsets",
			true,
		);
	});

	it("centers an existing Item when inline editing starts", async () => {
		const scrollToIndex = jest
			.spyOn(FlatList.prototype, "scrollToIndex")
			.mockImplementation();
		try {
			await renderWithSafeArea(<TestListItems />);

			await fireEvent.press(
				await screen.findByRole("button", { name: "Edit Apples" }),
			);

			await waitFor(() => {
				expect(scrollToIndex).toHaveBeenCalledWith({
					animated: true,
					index: 2,
					viewPosition: 0.5,
				});
			});
		} finally {
			scrollToIndex.mockRestore();
		}
	});

	it("opens details when title blur precedes the Details press", async () => {
		await renderWithSafeArea(<TestListItems />);
		await fireEvent.press(
			await screen.findByRole("button", { name: "Edit Milk" }),
		);
		const nameInput = await screen.findByLabelText("Item name");
		const detailsButton = await screen.findByRole("button", {
			name: "Item Details",
		});

		jest.useFakeTimers();
		try {
			await fireEvent(nameInput, "blur");
			await fireEvent(detailsButton, "touchStart");
			await fireEvent(detailsButton, "touchEnd");
			await act(() => {
				jest.advanceTimersByTime(1);
			});

			expect(screen.getByTestId("item-details-sheet")).toBeTruthy();
		} finally {
			jest.useRealTimers();
		}
	});

	it("returns to inline editing while the native Details dismissal finishes", async () => {
		await renderWithSafeArea(<TestListItems creationRequestKey={1} />);
		await fireEvent.press(
			await screen.findByRole("button", { name: "Item Details" }),
		);

		await fireEvent.press(
			await screen.findByRole("button", { name: "Cancel Item Details" }),
		);

		expect(screen.getByTestId("item-details-sheet")).toHaveAccessibilityValue({
			text: JSON.stringify({
				isPresented: false,
				showDragIndicator: false,
				snapPoints: ["full"],
			}),
		});
		expect(screen.getByRole("button", { name: "Item Details" })).toBeTruthy();

		await fireEvent.press(
			screen.getByTestId("item-details-sheet-complete-dismissal"),
		);
		await fireEvent.press(screen.getByRole("button", { name: "Item Details" }));
		expect(screen.getByTestId("item-details-sheet")).toHaveAccessibilityValue({
			text: JSON.stringify({
				isPresented: true,
				showDragIndicator: false,
				snapPoints: ["full"],
			}),
		});
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
		expect(screen.getByTestId("item-details-sheet")).toHaveAccessibilityValue({
			text: JSON.stringify({
				isPresented: false,
				showDragIndicator: false,
				snapPoints: ["full"],
			}),
		});
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
	listOverview?: ReactElement;
	onAddItem?: (input: AddListItemInput) => Promise<void>;
	onUpdateItem?: (input: UpdateListItemInput) => Promise<void>;
	onSetItemChecked?: (itemId: string, checked: boolean) => Promise<void>;
};

function TestListItems({
	initialState = populatedActiveListState,
	creationRequestKey = null,
	listOverview,
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

	return (
		<ListItems
			editor={editor}
			items={initialState.items}
			listOverview={listOverview}
			testID="test-list-items"
		/>
	);
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
