import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react-native";
import { selectionAsync } from "expo-haptics";
import type { PropsWithChildren } from "react";
import { Dimensions, FlatList } from "react-native";
import { NavigationDrawerProvider } from "@/client/app-shell/navigation-drawer-context";
import type { ListSummary } from "@/client/features/list/list-service";
import {
	activeListPage,
	authenticatedAppSession,
	groceriesListSummary,
	pantryListSummary,
} from "@/client/features/list/list-test-support";
import type {
	ListCollection,
	ListCollectionState,
	SelectListOutcome,
} from "@/client/features/list/use-list-collection";
import { useListCollection } from "@/client/features/list/use-list-collection";
import { useListPage } from "@/client/features/list/use-list-page";
import { useAuthenticatedAppSession, useSyncState } from "@/client/session";
import { deferred } from "@/test/async";
import { panBegin, panEnd, panMove } from "@/test/mocks/gesture-handler";
import { settleAnimations } from "@/test/mocks/reanimated";
import { TestSafeAreaProvider } from "@/test/safe-area";
import HomeScreen, { HomeScreenView } from "./home-screen";

const mockReplace = jest.fn();
const mockRetry = jest.fn();
const mockSelectList = jest.fn(
	async (_input: { listId: string }): Promise<SelectListOutcome> => ({
		status: "selected",
	}),
);
const mockStackScreenOptions = jest.fn();
/** Measured height a List page reports for its large in-page title. */
const LARGE_TITLE_HEIGHT = 66;
const hardwareListSummary = {
	...pantryListSummary,
	id: "lst_hardware",
	name: "Hardware",
};

jest.mock("expo-router", () => {
	const mockReact = jest.requireActual<typeof import("react")>("react");
	const mockReactNative =
		jest.requireActual<typeof import("react-native")>("react-native");

	// The real `Stack.Title` hands its child to the native header. The double
	// renders it in place so the collapsed title is queryable, which is the
	// closest a JS harness gets to a subview of the native navigation bar.
	function Title({ children }: PropsWithChildren<{ asChild?: boolean }>) {
		return children;
	}

	// The real bottom `Stack.Toolbar` hands its items to the native toolbar,
	// outside this tree. The double renders them in place so the toolbar is
	// queryable, which is the closest a JS harness gets to a subview of the
	// native toolbar.
	function Toolbar({ children }: PropsWithChildren<{ placement?: string }>) {
		return children;
	}

	Toolbar.Button = function ToolbarButton({
		accessibilityHint,
		accessibilityLabel,
		disabled,
		onPress,
	}: {
		accessibilityHint?: string;
		accessibilityLabel?: string;
		disabled?: boolean;
		onPress?: () => void;
	}) {
		return mockReact.createElement(mockReactNative.Pressable, {
			accessibilityHint,
			accessibilityLabel,
			accessibilityRole: "button",
			accessibilityState: { disabled: disabled === true },
			disabled,
			onPress,
		});
	};

	Toolbar.Spacer = function ToolbarSpacer() {
		return null;
	};

	Toolbar.View = function ToolbarView({ children }: PropsWithChildren) {
		return children;
	};

	function Screen({ options }: { options?: { title?: string } }) {
		mockStackScreenOptions(options);
		return options?.title
			? mockReact.createElement(
					mockReactNative.Text,
					{ accessibilityRole: "header" },
					options.title,
				)
			: null;
	}

	return {
		Stack: { Screen, Title, Toolbar },
		useRouter: () => ({ replace: mockReplace }),
	};
});

jest.mock("expo-router/build/react-navigation/elements", () => ({
	useHeaderHeight: () => 116,
}));

// Native haptics and native gesture recognition have no deterministic JS
// harness. Justification per docs/code-standards/testing.md:7.
jest.mock("expo-haptics", () => ({
	selectionAsync: jest.fn(async () => undefined),
}));

jest.mock("react-native-gesture-handler", () =>
	jest.requireActual("@/test/mocks/gesture-handler"),
);

// useAuthenticatedAppSession, useSyncState, useListCollection, and useListPage
// all sit on the PowerSync watched-query and native-session boundary, which has
// no deterministic local harness. The seam under test in this file is the
// screen's stack title, toolbar, and focus wiring, not List loading; List
// behavior runs against the real pager and List-page components.
// Justification per docs/code-standards/testing.md:9.
jest.mock("@/client/session", () => ({
	...jest.requireActual("@/client/session"),
	useAuthenticatedAppSession: jest.fn(),
	useSyncState: jest.fn(),
}));

jest.mock("@/client/features/list/use-list-collection", () => ({
	useListCollection: jest.fn(),
}));

jest.mock("@/client/features/list/use-list-page", () => ({
	useListPage: jest.fn(),
}));

beforeEach(() => {
	mockReplace.mockReset();
	mockRetry.mockReset();
	mockStackScreenOptions.mockClear();
	jest.mocked(useAuthenticatedAppSession).mockReturnValue({
		state: { status: "ready", refreshing: false },
		session: authenticatedAppSession,
		retry: jest.fn(),
		reloadSession: jest.fn(),
		signOut: jest.fn(),
	});
	jest.mocked(useSyncState).mockReturnValue("synced");
	jest
		.mocked(useListPage)
		.mockImplementation((_session, summary) => activeListPage(summary));
	mockSelectList.mockReset();
	mockSelectList.mockResolvedValue({ status: "selected" });
	showLists([groceriesListSummary]);
});

describe("HomeScreenView", () => {
	it("renders the loading Authenticated App Session state", async () => {
		await render(<HomeScreenView state={{ status: "loading" }} />);

		expect(await screen.findByText("Preparing your Household")).toBeTruthy();
	});

	it("renders the retry action for Authenticated App Session errors", async () => {
		const onRetry = jest.fn();
		await render(
			<HomeScreenView
				state={{ status: "error", message: "Unable to prepare." }}
				onRetry={onRetry}
			/>,
		);

		await fireEvent.press(await screen.findByText("Try again"));

		expect(onRetry).toHaveBeenCalledTimes(1);
	});
});

describe("HomeScreen", () => {
	it("renders the Current List page title and wires the drawer button", async () => {
		const open = jest.fn();

		await render(
			<NavigationDrawerProvider open={open}>
				<HomeScreen />
			</NavigationDrawerProvider>,
			{ wrapper: TestSafeAreaProvider },
		);

		expect(
			await screen.findByRole("header", { name: "Groceries" }),
		).toBeTruthy();
		expect(useListCollection).toHaveBeenCalledWith(authenticatedAppSession);

		await fireEvent.press(
			screen.getByRole("button", { name: "Open navigation" }),
		);

		expect(open).toHaveBeenCalledTimes(1);
	});

	it("opens Lists from the stack toolbar", async () => {
		await render(
			<NavigationDrawerProvider open={jest.fn()}>
				<HomeScreen />
			</NavigationDrawerProvider>,
			{ wrapper: TestSafeAreaProvider },
		);

		await fireEvent.press(
			await screen.findByRole("button", { name: "Open Lists" }),
		);

		expect(mockReplace).toHaveBeenCalledWith("/lists");
	});

	it("keeps the transparent stack header title empty while Lists are paged", async () => {
		await render(
			<NavigationDrawerProvider open={jest.fn()}>
				<HomeScreen />
			</NavigationDrawerProvider>,
			{ wrapper: TestSafeAreaProvider },
		);

		expect(mockStackScreenOptions).toHaveBeenLastCalledWith(
			expect.objectContaining({
				headerLargeTitle: false,
				headerTransparent: true,
				title: "",
			}),
		);
	});

	it("keeps the collapsed List title hidden while the large title is on screen", async () => {
		const view = await render(homeScreenSurface(), {
			wrapper: TestSafeAreaProvider,
		});
		await measureLargeTitle("Groceries");
		await view.rerender(homeScreenSurface());

		expect(collapsedListTitle()).toHaveStyle({ opacity: 0 });
	});

	it("reveals the collapsed List title once the focused List scrolls past its large title", async () => {
		const view = await render(homeScreenSurface(), {
			wrapper: TestSafeAreaProvider,
		});
		await measureLargeTitle("Groceries");
		await scrollFocusedList("lst_groceries", LARGE_TITLE_HEIGHT);
		await view.rerender(homeScreenSurface());

		expect(collapsedListTitle()).toHaveStyle({ opacity: 1 });
		expect(
			within(collapsedListTitle()).getByText("Groceries", {
				includeHiddenElements: true,
			}),
		).toBeTruthy();
	});

	it("fades the collapsed List title out while the pager drifts off its List", async () => {
		showLists([groceriesListSummary, pantryListSummary]);
		const view = await render(homeScreenSurface(), {
			wrapper: TestSafeAreaProvider,
		});
		await measureLargeTitle("Groceries");
		await scrollFocusedList("lst_groceries", LARGE_TITLE_HEIGHT);
		await view.rerender(homeScreenSurface());
		expect(collapsedListTitle()).toHaveStyle({ opacity: 1 });

		await dragPagerTo(Dimensions.get("window").width * 0.2);
		await view.rerender(homeScreenSurface());

		expect(collapsedListTitle()).toHaveStyle({ opacity: 0 });
	});

	it("hands the collapsed List title to the List the pager settles on", async () => {
		showLists([groceriesListSummary, pantryListSummary]);
		const view = await render(homeScreenSurface(), {
			wrapper: TestSafeAreaProvider,
		});
		await measureLargeTitle("Groceries");
		await measureLargeTitle("Pantry");
		await scrollFocusedList("lst_groceries", LARGE_TITLE_HEIGHT);
		await view.rerender(homeScreenSurface());
		expect(collapsedListTitle()).toHaveStyle({ opacity: 1 });

		await settlePagerAt(1);
		await view.rerender(homeScreenSurface());

		expect(
			within(collapsedListTitle()).getByText("Pantry", {
				includeHiddenElements: true,
			}),
		).toBeTruthy();
		// Paging returns every List page to the top, so the header must collapse
		// against the settled page rather than keep the offset it was handed by
		// the page the pager just left.
		expect(collapsedListTitle()).toHaveStyle({ opacity: 0 });
	});

	it.each([
		["still loading", { status: "loading" } as const],
		[
			"failed",
			{
				status: "error",
				message: "Unable to load this List. Please try again.",
				retry: () => {},
			} as const,
		],
	])("clears the collapsed List title when the pager settles on a page that is %s", async (_label, pantryState) => {
		showLists([groceriesListSummary, pantryListSummary]);
		jest
			.mocked(useListPage)
			.mockImplementation((_session, summary) =>
				summary.id === "lst_pantry" ? pantryState : activeListPage(summary),
			);
		const view = await render(homeScreenSurface(), {
			wrapper: TestSafeAreaProvider,
		});
		await measureLargeTitle("Groceries");
		await scrollFocusedList("lst_groceries", LARGE_TITLE_HEIGHT);
		await view.rerender(homeScreenSurface());
		expect(collapsedListTitle()).toHaveStyle({ opacity: 1 });

		await settlePagerAt(1);
		await view.rerender(homeScreenSurface());

		// A page that is not rendering its List has no large title of its own
		// behind the header, so the collapsed title must not carry over from
		// the page the pager just left.
		expect(collapsedListTitle()).toHaveStyle({ opacity: 0 });
	});

	it("updates the page title and persists selection when paging settles", async () => {
		showLists([groceriesListSummary, pantryListSummary]);
		await render(
			<NavigationDrawerProvider open={jest.fn()}>
				<HomeScreen />
			</NavigationDrawerProvider>,
			{ wrapper: TestSafeAreaProvider },
		);

		await settlePagerAt(1);

		expect(await screen.findByRole("header", { name: "Pantry" })).toBeTruthy();
		expect(mockSelectList).toHaveBeenCalledWith({ listId: "lst_pantry" });
	});

	it("moves the pager onto the settled List before the selection write resolves", async () => {
		showLists([groceriesListSummary, pantryListSummary]);
		const pendingSelection = deferred<SelectListOutcome>();
		mockSelectList.mockReturnValue(pendingSelection.promise);
		await render(
			<NavigationDrawerProvider open={jest.fn()}>
				<HomeScreen />
			</NavigationDrawerProvider>,
			{ wrapper: TestSafeAreaProvider },
		);

		await settlePagerScrollTo(1);

		// The focus moves on the swipe, not on the write it starts.
		expect(screen.getByRole("header", { name: "Pantry" })).toBeTruthy();
		expect(mockSelectList).toHaveBeenCalledWith({ listId: "lst_pantry" });

		await act(async () => {
			pendingSelection.resolve({ status: "selected" });
		});
		expect(screen.getByRole("header", { name: "Pantry" })).toBeTruthy();
	});

	it("ignores a second page switch while the first selection is still pending", async () => {
		showLists([groceriesListSummary, pantryListSummary, hardwareListSummary]);
		const pendingSelection = deferred<SelectListOutcome>();
		mockSelectList.mockReturnValue(pendingSelection.promise);
		await render(
			<NavigationDrawerProvider open={jest.fn()}>
				<HomeScreen />
			</NavigationDrawerProvider>,
			{ wrapper: TestSafeAreaProvider },
		);

		await settlePagerScrollTo(1);
		expect(mockSelectList).toHaveBeenCalledTimes(1);
		// A pending write also parks the pager, so a swipe cannot outrun it.
		expect(screen.getByTestId("home-list-pager")).toHaveProp(
			"scrollEnabled",
			false,
		);

		await settlePagerScrollTo(2);

		expect(mockSelectList).toHaveBeenCalledTimes(1);
		expect(screen.getByRole("header", { name: "Pantry" })).toBeTruthy();

		await act(async () => {
			pendingSelection.resolve({ status: "selected" });
		});
		expect(screen.getByTestId("home-list-pager")).toHaveProp(
			"scrollEnabled",
			true,
		);
	});

	it("insets every List page below the transparent stack header", async () => {
		showLists([groceriesListSummary, pantryListSummary]);
		await render(
			<NavigationDrawerProvider open={jest.fn()}>
				<HomeScreen />
			</NavigationDrawerProvider>,
			{ wrapper: TestSafeAreaProvider },
		);

		for (const listId of ["lst_groceries", "lst_pantry"]) {
			const itemRows = screen.getByTestId(`home-list-items-${listId}`, {
				includeHiddenElements: true,
			});
			// iOS only auto-adjusts one of the nested pager Lists, so Home insets
			// each page itself and lets content scroll under the transparent header.
			expect(itemRows).toHaveProp("contentInsetAdjustmentBehavior", "never");
			expect(itemRows).toHaveProp(
				"contentContainerStyle",
				expect.arrayContaining([
					expect.objectContaining({
						paddingTop: 116,
					}),
				]),
			);
		}
	});

	it("reverts the focused List when persisting the selection fails", async () => {
		showLists([groceriesListSummary, pantryListSummary]);
		mockSelectList.mockResolvedValue({
			status: "notSelected",
			reason: "selectionFailed",
			currentListId: "lst_groceries",
		});
		await render(
			<NavigationDrawerProvider open={jest.fn()}>
				<HomeScreen />
			</NavigationDrawerProvider>,
			{ wrapper: TestSafeAreaProvider },
		);

		await settlePagerAt(1);

		expect(mockSelectList).toHaveBeenCalledWith({ listId: "lst_pantry" });
		// The rejected write names the List the pager must return to.
		await waitFor(() => {
			expect(screen.getByTestId("home-list-page-lst_groceries")).toBeTruthy();
		});
		expect(
			screen.getByTestId("home-adjacent-list-page-lst_pantry", {
				includeHiddenElements: true,
			}),
		).toBeTruthy();
	});

	it("updates the page title across consecutive horizontal swipes", async () => {
		showLists([groceriesListSummary, pantryListSummary, hardwareListSummary]);
		await render(
			<NavigationDrawerProvider open={jest.fn()}>
				<HomeScreen />
			</NavigationDrawerProvider>,
			{ wrapper: TestSafeAreaProvider },
		);

		await settlePagerAt(1);
		expect(await screen.findByRole("header", { name: "Pantry" })).toBeTruthy();
		await waitForSelectionCount(1);

		await settlePagerAt(2);
		expect(
			await screen.findByRole("header", { name: "Hardware" }),
		).toBeTruthy();
		expect(mockSelectList).toHaveBeenNthCalledWith(2, {
			listId: "lst_hardware",
		});
	});

	it("falls back to the Home title while the Current List is unresolved", async () => {
		showCollection({ status: "zeroActive" });

		await render(
			<NavigationDrawerProvider open={jest.fn()}>
				<HomeScreen />
			</NavigationDrawerProvider>,
			{ wrapper: TestSafeAreaProvider },
		);

		expect(await screen.findByRole("header", { name: "Home" })).toBeTruthy();
		expect(await screen.findByText("No active Lists")).toBeTruthy();
		// With no List on screen there is nothing for the page control to page.
		expect(
			screen.queryByTestId("home-list-page-control", {
				includeHiddenElements: true,
			}),
		).toBeNull();
	});

	it("keeps the Household loading card up until the Current List resolves", async () => {
		showCollection({ status: "loading" });
		const view = await render(homeScreenSurface(), {
			wrapper: TestSafeAreaProvider,
		});

		expect(await screen.findByText("Preparing your Household")).toBeTruthy();

		showCollection({
			status: "resolvingCurrentList",
			summaries: [groceriesListSummary],
		});
		await view.rerender(homeScreenSurface());

		expect(await screen.findByText("Preparing your Household")).toBeTruthy();
		// No List page mounts until there is a Current List to focus.
		expect(
			screen.queryByTestId("home-list-pager", { includeHiddenElements: true }),
		).toBeNull();
	});

	it("offers a retry when the List collection fails to load", async () => {
		showCollection({ status: "error", message: "Unable to load your Lists." });

		await render(homeScreenSurface(), { wrapper: TestSafeAreaProvider });

		expect(await screen.findByText("List unavailable")).toBeTruthy();
		expect(screen.getByText("Unable to load your Lists.")).toBeTruthy();
		await fireEvent.press(screen.getByRole("button", { name: "Try again" }));

		expect(mockRetry).toHaveBeenCalledTimes(1);
	});

	it("renders the Home header and status view without a session", async () => {
		jest.mocked(useAuthenticatedAppSession).mockReturnValue({
			state: { status: "loading" },
			session: null,
			retry: jest.fn(),
			reloadSession: jest.fn(),
			signOut: jest.fn(),
		});

		await render(
			<NavigationDrawerProvider open={jest.fn()}>
				<HomeScreen />
			</NavigationDrawerProvider>,
			{ wrapper: TestSafeAreaProvider },
		);

		expect(await screen.findByRole("header", { name: "Home" })).toBeTruthy();
		expect(await screen.findByText("Preparing your Household")).toBeTruthy();
	});
});

describe("Home bottom toolbar", () => {
	beforeEach(() => {
		showLists([groceriesListSummary, pantryListSummary, hardwareListSummary]);
	});

	it("reserves the Search placement without offering a search yet", async () => {
		await render(homeScreenSurface(), { wrapper: TestSafeAreaProvider });

		expect(screen.getByRole("button", { name: "Search" })).toHaveProp(
			"accessibilityState",
			{ disabled: true },
		);
	});

	it("names the focused List on the page control for assistive technology", async () => {
		await render(homeScreenSurface(), { wrapper: TestSafeAreaProvider });

		expect(pageControl()).toHaveProp("accessibilityRole", "adjustable");
		expect(pageControl()).toHaveProp("accessibilityValue", {
			text: "Groceries, List 1 of 3",
		});
		expect(pageControl()).toHaveProp("accessibilityActions", [
			{ name: "increment" },
			{ name: "decrement" },
		]);
	});

	it("moves the pager onto each List the drag crosses and persists only the last", async () => {
		const scrollToIndex = jest
			.spyOn(FlatList.prototype, "scrollToIndex")
			.mockImplementation();

		try {
			await render(homeScreenSurface(), { wrapper: TestSafeAreaProvider });
			scrollToIndex.mockClear();

			await dragPageControlAcross([
				DOT_TOUCH_X[0],
				DOT_TOUCH_X[1],
				DOT_TOUCH_X[2],
			]);

			// Each List the drag crossed was parked on without animating.
			expect(scrollToIndex).toHaveBeenCalledWith({ animated: false, index: 1 });
			expect(scrollToIndex).toHaveBeenCalledWith({ animated: false, index: 2 });
			expect(selectionAsync).toHaveBeenCalledTimes(2);
			expect(mockSelectList).toHaveBeenCalledTimes(1);
			expect(mockSelectList).toHaveBeenCalledWith({ listId: "lst_hardware" });
			expect(pageControl()).toHaveProp("accessibilityValue", {
				text: "Hardware, List 3 of 3",
			});
		} finally {
			scrollToIndex.mockRestore();
		}
	});

	it("walks the window through more Lists than the strip can show", async () => {
		const scrollToIndex = jest
			.spyOn(FlatList.prototype, "scrollToIndex")
			.mockImplementation();
		showLists(manyListSummaries(30));

		try {
			await render(homeScreenSurface(), { wrapper: TestSafeAreaProvider });

			// The window opens on the first Lists, so only the Lists after it are
			// behind a chevron.
			expect(overflowChevron("before")).toBeNull();
			expect(overflowChevron("after")).toBeTruthy();

			// Each drag runs the width of the window and lands on its last List,
			// which recentres the window on that List. Five drags carry the focus
			// from the first List to the thirtieth.
			const reached: string[] = [];
			for (let drag = 0; drag < 5; drag += 1) {
				await dragPageControlAcross([
					WINDOW_TOUCH_X.first,
					WINDOW_TOUCH_X.last,
				]);
				reached.push(focusedListValue());
			}

			expect(reached).toEqual([
				"List 10, List 10 of 30",
				"List 15, List 15 of 30",
				"List 20, List 20 of 30",
				"List 25, List 25 of 30",
				"List 30, List 30 of 30",
			]);
			expect(mockSelectList).toHaveBeenLastCalledWith({
				listId: "lst_list_30",
			});
			// The window has run out of Lists to show on the far side.
			expect(overflowChevron("before")).toBeTruthy();
			expect(overflowChevron("after")).toBeNull();
		} finally {
			scrollToIndex.mockRestore();
		}
	});

	it("holds the window still under a finger that is already scrubbing", async () => {
		const scrollToIndex = jest
			.spyOn(FlatList.prototype, "scrollToIndex")
			.mockImplementation();
		showLists(manyListSummaries(30));

		try {
			await render(homeScreenSurface(), { wrapper: TestSafeAreaProvider });
			// Park the focus mid-run so the window has Lists on both sides of it.
			await dragPageControlAcross([WINDOW_TOUCH_X.first, WINDOW_TOUCH_X.last]);
			expect(windowedListIndexes()).toEqual([
				5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
			]);

			// A finger landing on the window's first dot moves the focused List
			// there, which would recentre the window if the window followed the
			// focus, remapping the dots out from under the finger mid-drag.
			await act(async () => {
				panBegin(WINDOW_TOUCH_X.first);
			});

			expect(focusedListValue()).toBe("List 6, List 6 of 30");
			expect(windowedListIndexes()).toEqual([
				5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
			]);

			// Lifting hands the window back to the List the drag landed on.
			await act(async () => {
				panEnd();
			});
			expect(windowedListIndexes()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		} finally {
			scrollToIndex.mockRestore();
		}
	});

	it("steps through every List for assistive technology, window or not", async () => {
		showLists(manyListSummaries(30));
		await render(homeScreenSurface(), { wrapper: TestSafeAreaProvider });

		// The window shows ten Lists; stepping past its edge moves the Lists on,
		// it does not stop at the last dot.
		for (let step = 0; step < 12; step += 1) {
			await act(async () => {
				fireEvent(pageControl(), "accessibilityAction", {
					nativeEvent: { actionName: "increment" },
				});
			});
		}

		expect(focusedListValue()).toBe("List 13, List 13 of 30");
	});

	it("returns the page control to the focused List when persisting the drag fails", async () => {
		mockSelectList.mockResolvedValue({
			status: "notSelected",
			reason: "selectionFailed",
			currentListId: "lst_groceries",
		});
		await render(homeScreenSurface(), { wrapper: TestSafeAreaProvider });

		await dragPageControlAcross([DOT_TOUCH_X[0], DOT_TOUCH_X[1]]);

		await waitFor(() => {
			expect(screen.getByTestId("home-list-page-lst_groceries")).toBeTruthy();
		});
		expect(pageControl()).toHaveProp("accessibilityValue", {
			text: "Groceries, List 1 of 3",
		});
	});

	it("steps the page control one List at a time for assistive technology", async () => {
		await render(homeScreenSurface(), { wrapper: TestSafeAreaProvider });

		await act(async () => {
			fireEvent(pageControl(), "accessibilityAction", {
				nativeEvent: { actionName: "increment" },
			});
		});
		expect(mockSelectList).toHaveBeenCalledWith({ listId: "lst_pantry" });

		await act(async () => {
			fireEvent(pageControl(), "accessibilityAction", {
				nativeEvent: { actionName: "decrement" },
			});
		});
		expect(mockSelectList).toHaveBeenLastCalledWith({
			listId: "lst_groceries",
		});
	});

	it("becomes the List picker's close button while the picker is open", async () => {
		await render(homeScreenSurface(), { wrapper: TestSafeAreaProvider });

		await fireEvent.press(screen.getByRole("button", { name: "Choose List" }));

		expect(await findToolbarButton("Close List picker")).toBeTruthy();
		expect(
			screen.queryByRole("button", {
				name: "Choose List",
				includeHiddenElements: true,
			}),
		).toBeNull();

		await fireEvent.press(await findToolbarButton("Close List picker"));
		// The page control is back the moment the picker starts receding, so the
		// bar feels snappy instead of waiting out the zoom.
		expect(await findToolbarButton("Choose List")).toBeTruthy();
		expect(
			screen.queryByRole("button", {
				name: "Close List picker",
				includeHiddenElements: true,
			}),
		).toBeNull();
		// The receding picker itself stays mounted until the zoom lands.
		expect(screen.getByTestId("home-list-picker")).toBeTruthy();
		await act(async () => {
			settleAnimations();
		});
		expect(screen.queryByTestId("home-list-picker")).toBeNull();
	});

	it("starts inline creation from the floating add button", async () => {
		await render(homeScreenSurface(), { wrapper: TestSafeAreaProvider });
		expect(pageControl()).toBeTruthy();
		expect(screen.getByTestId("home-add-item-button-position")).toHaveStyle({
			bottom: 88,
		});

		await fireEvent.press(screen.getByRole("button", { name: "Add Item" }));

		expect(await screen.findByLabelText("Item name")).toBeTruthy();
		expect(
			screen.queryByRole("button", {
				name: "Add Item",
				includeHiddenElements: true,
			}),
		).toBeNull();
		expect(pageControl()).toBeTruthy();
		expect(pageControl().props.accessibilityState).toEqual({ disabled: true });
		expect(
			screen.getByRole("button", { name: "Choose List" }).props
				.accessibilityState,
		).toEqual({ disabled: true });
		expect(screen.getByTestId("home-list-pager")).toHaveProp(
			"scrollEnabled",
			true,
		);
	});

	it("does not replay a dismissed creation draft after paging", async () => {
		showLists([groceriesListSummary, pantryListSummary]);
		await render(homeScreenSurface(), { wrapper: TestSafeAreaProvider });

		await fireEvent.press(screen.getByRole("button", { name: "Add Item" }));
		await screen.findByLabelText("Item name");

		await settlePagerAt(1);

		expect(screen.getByRole("header", { name: "Pantry" })).toBeTruthy();
		expect(screen.queryByLabelText("Item name")).toBeNull();
		expect(screen.getByRole("button", { name: "Add Item" })).toBeTruthy();

		await settlePagerAt(0);
		expect(screen.getByRole("header", { name: "Groceries" })).toBeTruthy();
		expect(screen.queryByLabelText("Item name")).toBeNull();
	});

	it("keeps the source List focused when an Item write reorders recent activity", async () => {
		showLists([groceriesListSummary, pantryListSummary]);
		const view = await render(homeScreenSurface(), {
			wrapper: TestSafeAreaProvider,
		});

		await fireEvent.press(screen.getByRole("button", { name: "Add Item" }));
		showLists([pantryListSummary, groceriesListSummary]);
		await view.rerender(homeScreenSurface());

		expect(screen.getByTestId("home-list-page-lst_groceries")).toBeTruthy();
	});
});

/**
 * Drags a finger across the page control, one touch position per entry, each
 * its own render pass so the pager settles onto every List the drag crosses
 * rather than only the one it lands on.
 */
async function dragPageControlAcross(
	touchPositionsX: readonly number[],
): Promise<void> {
	const [start, ...moves] = touchPositionsX;
	if (start === undefined) throw new Error("A drag needs a starting position");

	await act(async () => {
		panBegin(start);
	});
	for (const touchPositionX of moves) {
		await act(async () => {
			panMove(touchPositionX);
		});
	}
	await act(async () => {
		panEnd();
	});
}

/**
 * Horizontal touch positions inside the page control that land on each dot,
 * measured from the control's left edge the way the pan gesture reports them.
 */
const DOT_TOUCH_X = [10, 30, 46];

/**
 * Touch positions on the first and last dot of a windowed strip, measured from
 * the control's left edge: the chevron gutter and the edge slop put the first
 * slot 20 points in, and nine slots of 16 points follow it.
 */
const WINDOW_TOUCH_X = { first: 24, last: 164 };

/** More Lists than the page control can show dots for. */
function manyListSummaries(count: number) {
	return Array.from({ length: count }, (_, index) =>
		index === 0
			? groceriesListSummary
			: {
					...pantryListSummary,
					id: `lst_list_${index + 1}`,
					name: `List ${index + 1}`,
				},
	);
}

function pageControl() {
	return screen.getByTestId("home-list-page-control", {
		includeHiddenElements: true,
	});
}

/** What the page control tells assistive technology it is focused on. */
function focusedListValue(): string {
	const { accessibilityValue } = pageControl().props as {
		accessibilityValue: { text: string };
	};
	return accessibilityValue.text;
}

/** The Lists the page control is currently showing a dot for, in order. */
function windowedListIndexes(): number[] {
	return screen
		.getAllByTestId(/^home-list-page-dot-/, { includeHiddenElements: true })
		.map((dot) =>
			Number((dot.props as { testID: string }).testID.replace(/\D+/, "")),
		);
}

/** The chevron standing for the Lists on one side of the window, if any. */
function overflowChevron(side: "before" | "after") {
	return screen.queryByTestId(`home-list-page-overflow-${side}`, {
		includeHiddenElements: true,
	});
}

/**
 * Hidden elements count: an open List picker is `accessibilityViewIsModal`,
 * which masks its siblings, while the real toolbar renders outside the screen's
 * view tree and stays reachable.
 */
function findToolbarButton(name: string) {
	return screen.findByRole("button", { name, includeHiddenElements: true });
}

/**
 * Collapsed-title assertions re-render before reading the animated style: the
 * Reanimated double evaluates animated styles during render instead of on the
 * UI thread (see `src/test/mocks/reanimated.ts`). Each call returns a fresh
 * element so React cannot bail out of the re-render.
 */
function homeScreenSurface() {
	return (
		<NavigationDrawerProvider open={jest.fn()}>
			<HomeScreen />
		</NavigationDrawerProvider>
	);
}

/** The List title in the native header, hidden from assistive technology. */
function collapsedListTitle() {
	return screen.getByTestId("home-collapsed-list-title", {
		includeHiddenElements: true,
	});
}

async function measureLargeTitle(name: string): Promise<void> {
	await act(async () => {
		// Adjacent pager pages are masked from assistive technology, so an
		// unfocused page's large title only resolves as a hidden element.
		const largeTitle = screen.getByRole("header", {
			name,
			includeHiddenElements: true,
		});
		fireEvent(largeTitle, "layout", {
			nativeEvent: {
				layout: { x: 0, y: 0, width: 390, height: LARGE_TITLE_HEIGHT },
			},
		});
	});
}

async function scrollFocusedList(
	listId: string,
	offsetY: number,
): Promise<void> {
	await act(async () => {
		fireEvent(screen.getByTestId(`home-list-items-${listId}`), "scroll", {
			nativeEvent: {
				contentOffset: { x: 0, y: offsetY },
				contentSize: { width: 390, height: 1200 },
				layoutMeasurement: { width: 390, height: 844 },
			},
		});
	});
}

async function dragPagerTo(offsetX: number): Promise<void> {
	const { width } = Dimensions.get("window");
	await act(async () => {
		fireEvent(screen.getByTestId("home-list-pager"), "scroll", {
			nativeEvent: {
				contentOffset: { x: offsetX, y: 0 },
				contentSize: { width: width * 2, height: 844 },
				layoutMeasurement: { width, height: 844 },
			},
		});
	});
}

/** Lands the pager on a page without waiting for the selection write. */
async function settlePagerScrollTo(index: number): Promise<void> {
	await act(async () => {
		fireEvent(screen.getByTestId("home-list-pager"), "momentumScrollEnd", {
			nativeEvent: {
				contentOffset: { x: index * Dimensions.get("window").width, y: 0 },
			},
		});
	});
}

async function settlePagerAt(index: number): Promise<void> {
	await settlePagerScrollTo(index);
	await waitFor(() => {
		expect(screen.getByTestId("home-list-pager")).toHaveProp(
			"scrollEnabled",
			true,
		);
	});
}

async function waitForSelectionCount(count: number): Promise<void> {
	await waitFor(() => {
		expect(mockSelectList).toHaveBeenCalledTimes(count);
	});
}

/** Puts the collection in its active state around the given List summaries. */
function showLists(summaries: readonly ListSummary[]): void {
	const currentListId = summaries[0]?.id;
	showCollection(
		currentListId === undefined
			? { status: "zeroActive" }
			: { status: "active", summaries, currentListId },
	);
}

function showCollection(state: ListCollectionState): void {
	jest.mocked(useListCollection).mockReturnValue(collectionFixture(state));
}

function collectionFixture(state: ListCollectionState): ListCollection {
	return {
		state,
		actions: {
			retry: mockRetry,
			selectList: mockSelectList,
			createList: jest.fn(async () => ({ status: "failed" as const })),
			renameList: jest.fn(async () => ({ status: "failed" as const })),
			deleteList: jest.fn(async () => ({ status: "failed" as const })),
		},
	};
}
