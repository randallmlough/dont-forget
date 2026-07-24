import { fireEvent, render, screen } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CurrentList, type HomeCurrentListDeps } from "./current-list";
import {
	authenticatedAppSession,
	emptyActiveListState,
} from "./list-test-support";

describe("CurrentList", () => {
	it("renders the active List surface", async () => {
		await render(
			<CurrentList
				session={authenticatedAppSession}
				deps={activeListDeps()}
				onOpenLists={jest.fn()}
			/>,
			{ wrapper: TestSafeAreaProvider },
		);

		expect(await screen.findByText("No Items yet")).toBeTruthy();
	});

	it("opens Lists from the zero-active Create List action", async () => {
		const onOpenLists = jest.fn();
		await render(
			<CurrentList
				session={authenticatedAppSession}
				deps={zeroActiveListDeps()}
				onOpenLists={onOpenLists}
			/>,
			{ wrapper: TestSafeAreaProvider },
		);

		expect(await screen.findByText("No active Lists")).toBeTruthy();
		await fireEvent.press(screen.getByRole("button", { name: "Create List" }));

		expect(onOpenLists).toHaveBeenCalledTimes(1);
	});

	it("adds Items through the Current List action with normalized optional fields", async () => {
		const addItem = jest.fn(async () => undefined);
		await render(
			<CurrentList
				session={authenticatedAppSession}
				deps={activeListDeps(addItem)}
				onOpenLists={jest.fn()}
			/>,
			{ wrapper: TestSafeAreaProvider },
		);

		await fireEvent(await screen.findByLabelText("Add Item"), "focus");
		await fireEvent.changeText(
			await screen.findByLabelText("Item name"),
			" Milk ",
		);
		await fireEvent.press(
			await screen.findByRole("button", { name: "Add Item" }),
		);

		expect(addItem).toHaveBeenCalledWith({
			listId: "lst_groceries",
			name: "Milk",
			quantity: null,
			notes: null,
		});
	});
});

function activeListDeps(
	addItem = jest.fn(async () => undefined),
): HomeCurrentListDeps {
	return {
		currentList: {
			state: {
				status: "active",
				listId: "lst_groceries",
				list: emptyActiveListState,
				actions: {
					addItem,
					setItemChecked: jest.fn(async () => undefined),
				},
			},
			retry: jest.fn(),
			reload: jest.fn(),
		},
		syncState: "synced",
		listRows: { status: "ready", summaries: [] },
	};
}

function zeroActiveListDeps(): HomeCurrentListDeps {
	return {
		currentList: {
			state: { status: "zeroActive" },
			retry: jest.fn(),
			reload: jest.fn(),
		},
		syncState: "synced",
		listRows: { status: "ready", summaries: [] },
	};
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
