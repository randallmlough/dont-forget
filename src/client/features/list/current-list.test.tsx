import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { Dimensions, FlatList, StyleSheet, type ViewStyle } from "react-native";
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

/** Measured height a List page reports for its large in-page title. */
const LARGE_TITLE_HEIGHT = 66;

/** Width one List page occupies in the horizontal pager. */
const PAGE_WIDTH = Dimensions.get("window").width;

beforeEach(() => {
	jest.mocked(useListPage).mockImplementation((_session, summary) => ({
		status: "active",
		listId: summary.id,
		list: { ...emptyActiveListState, listName: summary.name },
		actions: {
			addItem: jest.fn(async () => undefined),
			setItemChecked: jest.fn(async () => undefined),
		},
	}));
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

	it("resets both List pages to the toolbar inset when focus changes", async () => {
		const scrollToOffset = jest
			.spyOn(FlatList.prototype, "scrollToOffset")
			.mockImplementation();
		const deps = activeListDeps(
			jest.fn(async () => undefined),
			[groceriesListSummary, pantryListSummary],
		);

		try {
			const view = await render(
				<CurrentList
					session={authenticatedAppSession}
					deps={deps}
					focusedListId="lst_groceries"
					onFocusList={jest.fn(async () => true)}
					onOpenLists={jest.fn()}
					topContentInset={116}
				/>,
				{ wrapper: TestSafeAreaProvider },
			);
			await waitFor(() => {
				expect(scrollToOffset).toHaveBeenCalledWith({
					animated: false,
					offset: 0,
				});
			});
			expect(scrollToOffset).toHaveBeenCalledTimes(2);
			scrollToOffset.mockClear();

			await view.rerender(
				<CurrentList
					session={authenticatedAppSession}
					deps={deps}
					focusedListId="lst_pantry"
					onFocusList={jest.fn(async () => true)}
					onOpenLists={jest.fn()}
					topContentInset={116}
				/>,
			);

			await waitFor(() => {
				expect(scrollToOffset).toHaveBeenCalledWith({
					animated: false,
					offset: 0,
				});
			});
			expect(scrollToOffset).toHaveBeenCalledTimes(2);
		} finally {
			scrollToOffset.mockRestore();
		}
	});

	it("restores the initial List position when native content becomes scrollable", async () => {
		const scrollToOffset = jest
			.spyOn(FlatList.prototype, "scrollToOffset")
			.mockImplementation();

		try {
			await render(
				<CurrentList
					session={authenticatedAppSession}
					deps={activeListDeps()}
					focusedListId="lst_groceries"
					onFocusList={jest.fn(async () => true)}
					onOpenLists={jest.fn()}
					topContentInset={116}
				/>,
				{ wrapper: TestSafeAreaProvider },
			);
			scrollToOffset.mockClear();

			fireEvent(
				screen.getByTestId("home-list-items-lst_groceries"),
				"contentSizeChange",
				390,
				1200,
			);

			expect(scrollToOffset).toHaveBeenCalledWith({
				animated: false,
				offset: 0,
			});
		} finally {
			scrollToOffset.mockRestore();
		}
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
		jest.mocked(useListPage).mockReturnValue({
			status: "active",
			listId: "lst_groceries",
			list: emptyActiveListState,
			actions: {
				addItem,
				setItemChecked: jest.fn(async () => undefined),
			},
		});
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
			fireEvent(screen.getByTestId("home-list-pager"), "momentumScrollEnd", {
				nativeEvent: {
					contentOffset: { x: Dimensions.get("window").width, y: 0 },
				},
			});
		});

		await waitFor(() => {
			expect(onFocusList).toHaveBeenCalledWith("lst_pantry");
		});
		await waitFor(() => {
			expect(screen.getByTestId("home-list-pager")).toHaveProp(
				"scrollEnabled",
				true,
			);
		});
	});

	it("keeps the sticky List title hidden while the large title is on screen", async () => {
		const view = await render(groceriesListSurface(), {
			wrapper: TestSafeAreaProvider,
		});
		await measureLargeTitle("Groceries");
		await view.rerender(groceriesListSurface());

		expect(stickyListTitle("lst_groceries")).toHaveStyle({ opacity: 0 });
	});

	it("reveals the sticky List title once the page scrolls past its large title", async () => {
		const view = await render(groceriesListSurface(), {
			wrapper: TestSafeAreaProvider,
		});
		await measureLargeTitle("Groceries");
		await act(async () => {
			fireEvent(
				screen.getByTestId("home-list-items-lst_groceries"),
				"scroll",
				verticalScrollEvent(LARGE_TITLE_HEIGHT),
			);
		});
		await view.rerender(groceriesListSurface());

		expect(stickyListTitle("lst_groceries")).toHaveStyle({ opacity: 1 });
	});

	it("returns to the focused List when persisting a paged selection fails", async () => {
		const scrollToIndex = jest
			.spyOn(FlatList.prototype, "scrollToIndex")
			.mockImplementation();
		const onFocusList = jest.fn(async () => false);

		try {
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
				fireEvent(screen.getByTestId("home-list-pager"), "momentumScrollEnd", {
					nativeEvent: {
						contentOffset: { x: Dimensions.get("window").width, y: 0 },
					},
				});
			});

			await waitFor(() => {
				expect(onFocusList).toHaveBeenCalledWith("lst_pantry");
			});
			await waitFor(() => {
				expect(scrollToIndex).toHaveBeenCalledWith({
					animated: true,
					index: 0,
				});
			});
		} finally {
			scrollToIndex.mockRestore();
		}
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

	it("renders each List title inside its sliding page", async () => {
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

		const adjacentPage = screen.getByTestId(
			"home-adjacent-list-page-lst_pantry",
			{ includeHiddenElements: true },
		);
		expect(
			within(adjacentPage).getByRole("header", {
				name: "Pantry",
				includeHiddenElements: true,
			}),
		).toBeTruthy();
	});

	it("keeps the page filling the viewport flat and turns its neighbour away", async () => {
		await render(pagedListSurface(), { wrapper: TestSafeAreaProvider });

		expect(pageTiltDegrees("home-list-page-lst_groceries")).toBe(0);
		expect(
			pageTiltDegrees("home-adjacent-list-page-lst_pantry"),
		).toBeGreaterThan(0);
	});

	it("turns both pages toward the swipe as the pager scrolls between them", async () => {
		const view = await render(pagedListSurface(), {
			wrapper: TestSafeAreaProvider,
		});
		const restingTilt = pageTiltDegrees("home-adjacent-list-page-lst_pantry");
		await act(async () => {
			fireEvent(
				screen.getByTestId("home-list-pager"),
				"scroll",
				horizontalScrollEvent(PAGE_WIDTH / 2),
			);
		});
		await view.rerender(pagedListSurface());

		expect(pageTiltDegrees("home-list-page-lst_groceries")).toBeLessThan(0);
		const arrivingTilt = pageTiltDegrees("home-adjacent-list-page-lst_pantry");
		expect(arrivingTilt).toBeGreaterThan(0);
		expect(arrivingTilt).toBeLessThan(restingTilt);
	});

	it("keeps the focused List on its watched Item data", async () => {
		jest.mocked(useListPage).mockReturnValue({
			status: "active",
			listId: "lst_pantry",
			list: {
				...emptyActiveListState,
				listName: "Pantry",
				items: [
					{
						id: "itm_shelf_stable",
						name: "Shelf stable",
						quantity: null,
						notes: null,
						checked: false,
						checkedByMemberName: null,
					},
				],
			},
			actions: {
				addItem: jest.fn(async () => undefined),
				setItemChecked: jest.fn(async () => undefined),
			},
		});

		await render(
			<CurrentList
				session={authenticatedAppSession}
				deps={pantryCurrentListDeps()}
				focusedListId="lst_pantry"
				onFocusList={jest.fn(async () => true)}
				onOpenLists={jest.fn()}
			/>,
			{ wrapper: TestSafeAreaProvider },
		);

		expect(
			within(screen.getByTestId("home-list-items-lst_pantry")).getByText(
				"Shelf stable",
			),
		).toBeTruthy();
	});
});

/**
 * Sticky-title assertions re-render before reading the animated style: the
 * Reanimated double evaluates animated styles during render instead of on the
 * UI thread (see `src/test/mocks/reanimated.ts`). Each call returns a fresh
 * element so React cannot bail out of the re-render.
 */
function groceriesListSurface() {
	return (
		<CurrentList
			session={authenticatedAppSession}
			deps={activeListDeps()}
			focusedListId="lst_groceries"
			onFocusList={jest.fn(async () => true)}
			onOpenLists={jest.fn()}
			topContentInset={116}
		/>
	);
}

function pagedListSurface() {
	return (
		<CurrentList
			session={authenticatedAppSession}
			deps={activeListDeps(undefined, [
				groceriesListSummary,
				pantryListSummary,
			])}
			focusedListId="lst_groceries"
			onFocusList={jest.fn(async () => true)}
			onOpenLists={jest.fn()}
			topContentInset={116}
		/>
	);
}

/**
 * Degrees the carousel has turned this page around its vertical axis. A
 * positive angle pushes the page's right edge away from the viewer, so the page
 * waiting on the right reads positive and the page leaving to the left reads
 * negative.
 */
function pageTiltDegrees(testID: string): number {
	const style = StyleSheet.flatten<ViewStyle>(
		screen.getByTestId(testID, { includeHiddenElements: true }).props.style,
	);
	const transforms = style.transform;
	if (!Array.isArray(transforms)) {
		throw new Error(`${testID} is not carrying a carousel transform`);
	}
	for (const entry of transforms) {
		if (typeof entry.rotateY === "string") {
			return Number.parseFloat(entry.rotateY);
		}
	}
	throw new Error(`${testID} is not carrying a carousel rotation`);
}

async function measureLargeTitle(name: string): Promise<void> {
	await act(async () => {
		fireEvent(screen.getByRole("header", { name }), "layout", {
			nativeEvent: {
				layout: { x: 0, y: 0, width: 390, height: LARGE_TITLE_HEIGHT },
			},
		});
	});
}

function verticalScrollEvent(offsetY: number) {
	return {
		nativeEvent: {
			contentOffset: { x: 0, y: offsetY },
			contentSize: { width: 390, height: 1200 },
			layoutMeasurement: { width: 390, height: 844 },
		},
	};
}

function horizontalScrollEvent(offsetX: number) {
	return {
		nativeEvent: {
			contentOffset: { x: offsetX, y: 0 },
			contentSize: { width: PAGE_WIDTH * 2, height: 844 },
			layoutMeasurement: { width: PAGE_WIDTH, height: 844 },
		},
	};
}

function stickyListTitle(listId: string) {
	return screen.getByTestId(`home-list-sticky-title-${listId}`, {
		includeHiddenElements: true,
	});
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

function pantryCurrentListDeps(): HomeCurrentListDeps {
	return {
		currentList: {
			state: {
				status: "active",
				listId: "lst_pantry",
				list: { ...emptyActiveListState, listName: "Pantry" },
				actions: {
					addItem: jest.fn(async () => undefined),
					setItemChecked: jest.fn(async () => undefined),
				},
			},
			retry: jest.fn(),
			reload: jest.fn(),
		},
		syncState: "synced",
		listRows: {
			status: "ready",
			summaries: [groceriesListSummary, pantryListSummary],
		},
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
