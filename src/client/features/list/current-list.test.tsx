import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import {
	PanResponder,
	type PanResponderCallbacks,
	type PanResponderGestureState,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CurrentList, type HomeCurrentListDeps } from "./current-list";
import {
	authenticatedAppSession,
	emptyActiveListState,
	groceriesListSummary,
	pantryListSummary,
} from "./list-test-support";
import { useListPage } from "./use-list-page";

// Adjacent pager pages own live PowerSync queries. These tests exercise the
// app-owned pager/picker composition while this narrow double replaces only
// that watched-query boundary.
jest.mock("./use-list-page", () => ({
	useListPage: jest.fn(),
}));

let pagerResponder: PanResponderCallbacks;
const createPanResponder = PanResponder.create;

beforeAll(() => {
	jest.spyOn(PanResponder, "create").mockImplementation((callbacks) => {
		pagerResponder = callbacks;
		return createPanResponder(callbacks);
	});
});

afterAll(() => {
	jest.restoreAllMocks();
});

beforeEach(() => {
	jest.mocked(useListPage).mockReturnValue({
		status: "active",
		listId: "lst_pantry",
		list: { ...emptyActiveListState, listName: "Pantry" },
		actions: {
			addItem: jest.fn(async () => undefined),
			setItemChecked: jest.fn(async () => undefined),
		},
	});
});

describe("CurrentList", () => {
	it("renders the active List surface", async () => {
		await render(
			<CurrentList
				session={authenticatedAppSession}
				deps={activeListDeps()}
				focusedListId="lst_groceries"
				onFocusList={jest.fn(async () => true)}
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
				focusedListId={null}
				onFocusList={jest.fn(async () => true)}
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
				focusedListId="lst_groceries"
				onFocusList={jest.fn(async () => true)}
				onOpenLists={jest.fn()}
			/>,
			{ wrapper: TestSafeAreaProvider },
		);

		expect(screen.queryByText("Add an Item…")).toBeNull();
		await fireEvent.press(
			await screen.findByRole("button", { name: "Add the first Item" }),
		);
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

	it("opens the opaque List picker and focuses the selected List", async () => {
		const onFocusList = jest.fn(async () => true);
		await render(
			<CurrentList
				session={authenticatedAppSession}
				deps={activeListDeps(undefined, [
					groceriesListSummary,
					pantryListSummary,
				])}
				focusedListId="lst_groceries"
				onFocusList={onFocusList}
				onOpenLists={jest.fn()}
			/>,
			{ wrapper: TestSafeAreaProvider },
		);

		await fireEvent.press(
			await screen.findByRole("button", { name: "Choose List" }),
		);
		expect(await screen.findByTestId("home-list-picker")).toBeTruthy();

		await fireEvent.press(
			await screen.findByRole("button", { name: "Pantry" }),
		);

		await waitFor(() => {
			expect(onFocusList).toHaveBeenCalledWith("lst_pantry");
		});
		expect(screen.queryByTestId("home-list-picker")).toBeNull();
	});

	it("persists the focused List when horizontal paging settles", async () => {
		const onFocusList = jest.fn(async () => true);
		await render(
			<CurrentList
				session={authenticatedAppSession}
				deps={activeListDeps(undefined, [
					groceriesListSummary,
					pantryListSummary,
				])}
				focusedListId="lst_groceries"
				onFocusList={onFocusList}
				onOpenLists={jest.fn()}
			/>,
			{ wrapper: TestSafeAreaProvider },
		);
		await act(async () => {
			const release = pagerResponder.onPanResponderRelease;
			if (!release) throw new Error("Pager release responder was not created");
			Reflect.apply(release, undefined, [undefined, swipeLeftGesture()]);
		});

		await waitFor(() => {
			expect(onFocusList).toHaveBeenCalledWith("lst_pantry");
		});
	});

	it("keeps adjacent pager pages from intercepting the focused page", async () => {
		await render(
			<CurrentList
				session={authenticatedAppSession}
				deps={activeListDeps(undefined, [
					groceriesListSummary,
					pantryListSummary,
				])}
				focusedListId="lst_groceries"
				onFocusList={jest.fn(async () => true)}
				onOpenLists={jest.fn()}
			/>,
			{ wrapper: TestSafeAreaProvider },
		);

		expect(
			screen.getByTestId("home-adjacent-list-page-lst_pantry", {
				includeHiddenElements: true,
			}),
		).toHaveProp("pointerEvents", "none");
	});
});

function swipeLeftGesture(): PanResponderGestureState {
	return {
		stateID: 1,
		moveX: 0,
		moveY: 0,
		x0: 300,
		y0: 0,
		dx: -300,
		dy: 0,
		vx: -1,
		vy: 0,
		numberActiveTouches: 0,
		_accountsForMovesUpTo: 1,
	};
}

function activeListDeps(
	addItem = jest.fn(async () => undefined),
	summaries = [groceriesListSummary],
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
		listRows: { status: "ready", summaries },
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
