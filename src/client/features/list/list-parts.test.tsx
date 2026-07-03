import {
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import type { PropsWithChildren, ReactElement } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AddItemForm } from "./add-item-form";
import { ItemRows } from "./item-rows";
import { ListHeader } from "./list-header";
import {
	emptyActiveListState,
	largeActiveListState,
	populatedActiveListState,
} from "./list-test-support";
import type { ActiveListMeta, ActiveListState } from "./list-view-types";

describe("List parts", () => {
	it("renders header progress for an empty List", async () => {
		await renderWithSafeArea(
			<ListHeader
				state={emptyActiveListState}
				meta={meta()}
				onPressListName={jest.fn()}
			/>,
		);

		expect(await screen.findByText("No Items yet")).toBeTruthy();
	});

	it("renders header progress for a partially checked List", async () => {
		await renderWithSafeArea(
			<ListHeader state={populatedActiveListState} meta={meta()} />,
		);

		expect(await screen.findByText("1 of 3 Items checked")).toBeTruthy();
	});

	it("renders header progress for a fully checked List", async () => {
		await renderWithSafeArea(
			<ListHeader
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
			<ListHeader state={populatedActiveListState} meta={meta(syncState)} />,
		);

		expect(await screen.findByText(label)).toBeTruthy();
	});

	it("calls the toggle callback when an Item row is pressed", async () => {
		const onToggleItem = jest.fn();
		await renderWithSafeArea(
			<ItemRows
				items={populatedActiveListState.items}
				onToggleItem={onToggleItem}
			/>,
		);

		await fireEvent.press(await screen.findByText("Milk"));

		expect(onToggleItem).toHaveBeenCalledWith("item-1");
	});

	it("renders the empty List state", async () => {
		await renderWithSafeArea(<ItemRows items={[]} onToggleItem={jest.fn()} />);

		expect(await screen.findByText("This List is empty.")).toBeTruthy();
		expect(
			await screen.findByText("Add the first Item for your Household."),
		).toBeTruthy();
	});

	it("renders a larger List with long names and checked attribution", async () => {
		await renderWithSafeArea(
			<ItemRows items={largeActiveListState.items} onToggleItem={jest.fn()} />,
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

	it("opens the composer and submits a trimmed Item draft", async () => {
		const onAddItem = jest.fn(async () => undefined);
		await renderWithSafeArea(
			<AddItemForm
				listName="Groceries"
				errorMessage={null}
				onAddItem={onAddItem}
			/>,
		);

		await fireEvent.press(await screen.findByText("Add Item"));
		await fireEvent.changeText(
			await screen.findByLabelText("Item name"),
			" Milk ",
		);
		await fireEvent.press(await screen.findByLabelText("Submit Item"));

		await waitFor(() => {
			expect(onAddItem).toHaveBeenCalledWith({
				name: "Milk",
				quantity: "",
				notes: "",
			});
		});
	});
});

function renderWithSafeArea(element: ReactElement) {
	return render(<View style={{ flex: 1 }}>{element}</View>, {
		wrapper: TestSafeAreaProvider,
	});
}

function TestSafeAreaProvider({ children }: PropsWithChildren) {
	return (
		<SafeAreaProvider
			initialMetrics={{
				frame: { x: 0, y: 0, width: 390, height: 844 },
				insets: { top: 0, left: 0, right: 0, bottom: 24 },
			}}
		>
			{children}
		</SafeAreaProvider>
	);
}

function meta(
	syncState: ActiveListMeta["syncState"] = "synced",
): ActiveListMeta {
	return {
		currentMemberName: "Avery",
		errorMessage: null,
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
