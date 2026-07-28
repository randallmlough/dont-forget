import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react-native";
import { useMemo, useState } from "react";
import {
	Dimensions,
	FlatList,
	Pressable,
	StyleSheet,
	type ViewStyle,
} from "react-native";
import { useSharedValue } from "react-native-reanimated";
import {
	activeListPage,
	authenticatedAppSession,
	groceriesListSummary,
	pantryListSummary,
} from "@/client/features/list/list-test-support";
import { useListPage } from "@/client/features/list/use-list-page";
import { settleAnimations } from "@/test/mocks/reanimated";
import { TestSafeAreaProvider } from "@/test/safe-area";
import {
	HomeListPager,
	type HomeListPagerProps,
	type HomeListPickerPhase,
} from "./home-list-pager";

// Adjacent pager pages own live PowerSync queries. These tests exercise the
// app-owned pager/picker composition while this narrow double replaces only
// that watched-query boundary.
jest.mock("@/client/features/list/use-list-page", () => ({
	useListPage: jest.fn(),
}));

// The shared Reanimated double reports the reduced-motion setting as off; this
// suite covers both sides of that system setting.
const mockDevice = { reducedMotion: false };
jest.mock("react-native-reanimated", () => ({
	// Spreading the double drops the non-enumerable ES module marker its default
	// export needs.
	__esModule: true,
	...jest.requireActual("@/test/mocks/reanimated"),
	useReducedMotion: () => mockDevice.reducedMotion,
}));

/** Width one List page occupies in the horizontal pager. */
const PAGE_WIDTH = Dimensions.get("window").width;

afterEach(() => {
	mockDevice.reducedMotion = false;
});

beforeEach(() => {
	jest
		.mocked(useListPage)
		.mockImplementation((_session, summary) => activeListPage(summary));
});

describe("HomeListPager", () => {
	it("opens Lists from the zero-active Create List action", async () => {
		const onOpenLists = jest.fn();
		await render(
			<TestHomeListPager
				session={authenticatedAppSession}
				{...zeroActiveListProps()}
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

	it("opens the opaque List picker and focuses the selected List", async () => {
		const onFocusList = jest.fn(async () => true);
		await render(
			<TestHomeListPager
				session={authenticatedAppSession}
				{...activeListProps([groceriesListSummary, pantryListSummary])}
				focusedListId="lst_groceries"
				onFocusList={onFocusList}
				onOpenLists={jest.fn()}
			/>,
			{ wrapper: TestSafeAreaProvider },
		);

		await openListPicker();
		expect(await screen.findByTestId("home-list-picker")).toBeTruthy();

		await fireEvent.press(
			await screen.findByRole("button", { name: "Pantry" }),
		);

		await waitFor(() => {
			expect(onFocusList).toHaveBeenCalledWith("lst_pantry");
		});
		await settleListPickerZoom();
		expect(screen.queryByTestId("home-list-picker")).toBeNull();
	});

	it("keeps the List picker mounted and untappable until it finishes receding", async () => {
		await render(
			<TestHomeListPager
				session={authenticatedAppSession}
				{...activeListProps([groceriesListSummary, pantryListSummary])}
				focusedListId="lst_groceries"
				onFocusList={jest.fn(async () => true)}
				onOpenLists={jest.fn()}
			/>,
			{ wrapper: TestSafeAreaProvider },
		);

		await openListPicker();
		await closeListPicker();

		expect(screen.getByTestId("home-list-picker")).toHaveProp(
			"pointerEvents",
			"none",
		);
		await settleListPickerZoom();
		expect(screen.queryByTestId("home-list-picker")).toBeNull();
	});

	it("keeps a List picker reopened while it was receding open once the zoom lands", async () => {
		await render(
			<TestHomeListPager
				session={authenticatedAppSession}
				{...activeListProps([groceriesListSummary, pantryListSummary])}
				focusedListId="lst_groceries"
				onFocusList={jest.fn(async () => true)}
				onOpenLists={jest.fn()}
			/>,
			{ wrapper: TestSafeAreaProvider },
		);

		await openListPicker();
		await closeListPicker();
		await openListPicker();
		// The recede this reopen retargeted must not report itself as landed and
		// close the picker it is reopening.
		await settleListPickerZoom();

		expect(screen.getByTestId("home-list-picker")).toHaveProp(
			"pointerEvents",
			"auto",
		);
	});

	it("keeps the focused List unreachable while the picker zoom runs", async () => {
		await render(
			<TestHomeListPager
				session={authenticatedAppSession}
				{...activeListProps([groceriesListSummary, pantryListSummary])}
				focusedListId="lst_groceries"
				onFocusList={jest.fn(async () => true)}
				onOpenLists={jest.fn()}
			/>,
			{ wrapper: TestSafeAreaProvider },
		);
		const listSurface = screen.getByTestId("home-list-surface");

		await openListPicker();
		expect(listSurface).toHaveProp("pointerEvents", "none");

		await closeListPicker();
		expect(listSurface).toHaveProp("pointerEvents", "none");

		await settleListPickerZoom();
		expect(listSurface).toHaveProp("pointerEvents", "auto");
	});

	it("zooms the focused List away as the picker arrives", async () => {
		const view = await render(pagedListSurface(), {
			wrapper: TestSafeAreaProvider,
		});

		await openListPicker();
		await view.rerender(pagedListSurface());

		expect(surfaceScale("home-list-surface")).toBeLessThan(1);
	});

	it("crossfades to the picker without zooming under reduced motion", async () => {
		mockDevice.reducedMotion = true;
		const view = await render(pagedListSurface(), {
			wrapper: TestSafeAreaProvider,
		});

		await openListPicker();
		await view.rerender(pagedListSurface());

		expect(surfaceScale("home-list-surface")).toBe(1);
		expect(
			screen.getByTestId("home-list-surface", { includeHiddenElements: true }),
		).toHaveStyle({ opacity: 0 });
	});

	it("closes the List picker on the tap even when focusing the chosen List fails", async () => {
		// Focus reverting to the persisted List on failure is the screen's
		// contract; the picker's is that the tap closes it without waiting on
		// the write.
		const onFocusList = jest.fn(async () => false);
		await render(
			<TestHomeListPager
				session={authenticatedAppSession}
				{...activeListProps([groceriesListSummary, pantryListSummary])}
				focusedListId="lst_groceries"
				onFocusList={onFocusList}
				onOpenLists={jest.fn()}
			/>,
			{ wrapper: TestSafeAreaProvider },
		);

		await openListPicker();
		await fireEvent.press(
			await screen.findByRole("button", { name: "Pantry" }),
		);

		expect(screen.getByTestId("home-list-picker")).toHaveProp(
			"pointerEvents",
			"none",
		);
		await waitFor(() => {
			expect(onFocusList).toHaveBeenCalledWith("lst_pantry");
		});
		await settleListPickerZoom();
		expect(screen.queryByTestId("home-list-picker")).toBeNull();
	});

	it("persists the focused List when horizontal paging settles", async () => {
		const onFocusList = jest.fn(async () => true);
		await render(
			<TestHomeListPager
				session={authenticatedAppSession}
				{...activeListProps([groceriesListSummary, pantryListSummary])}
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

	it("returns to the focused List when persisting a paged selection fails", async () => {
		const scrollToIndex = jest
			.spyOn(FlatList.prototype, "scrollToIndex")
			.mockImplementation();
		const onFocusList = jest.fn(async () => false);

		try {
			await render(
				<TestHomeListPager
					session={authenticatedAppSession}
					{...activeListProps([groceriesListSummary, pantryListSummary])}
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
			<TestHomeListPager
				session={authenticatedAppSession}
				{...activeListProps([groceriesListSummary, pantryListSummary])}
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
			<TestHomeListPager
				session={authenticatedAppSession}
				{...activeListProps([groceriesListSummary, pantryListSummary])}
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

	it("keeps every other List reachable when one page's Items fail to load", async () => {
		jest.mocked(useListPage).mockImplementation((_session, summary) =>
			summary.id === "lst_groceries"
				? {
						status: "error",
						message: "Unable to load this List. Please try again.",
						retry: jest.fn(),
					}
				: activeListPage(summary),
		);

		await render(
			<TestHomeListPager
				session={authenticatedAppSession}
				{...activeListProps([groceriesListSummary, pantryListSummary])}
				focusedListId="lst_groceries"
				onFocusList={jest.fn(async () => true)}
				onOpenLists={jest.fn()}
			/>,
			{ wrapper: TestSafeAreaProvider },
		);

		// The failure stays on the page that owns it.
		expect(
			within(screen.getByTestId("home-list-page-lst_groceries")).getByText(
				"Unable to load this List. Please try again.",
			),
		).toBeTruthy();
		// The pager and the healthy List beside it are still mounted, and the
		// picker still opens, so the Household is not stuck on one bad List.
		expect(
			within(
				screen.getByTestId("home-adjacent-list-page-lst_pantry", {
					includeHiddenElements: true,
				}),
			).getByText("Pantry", { includeHiddenElements: true }),
		).toBeTruthy();
		await openListPicker();
		expect(await screen.findByTestId("home-list-picker")).toBeTruthy();
	});
});

/**
 * Renders `HomeListPager` the way the Home screen does: owning the shared values
 * the focused List page publishes its scroll state through, the picker and
 * composer open state, and the in-flight selection those two produce. The
 * stand-in picker buttons play the part of the native bottom toolbar, which
 * renders outside this tree; what the real toolbar and native header do with
 * this state is asserted against the real screen in
 * `src/client/screens/app/home-screen.test.tsx`.
 */
function TestHomeListPager({ onFocusList, ...props }: TestHomeListPagerProps) {
	const offsetY = useSharedValue(0);
	const largeTitleHeight = useSharedValue(0);
	const pagerDrift = useSharedValue(0);
	const collapsedTitleScroll = useMemo(
		() => ({ offsetY, largeTitleHeight, pagerDrift }),
		[offsetY, largeTitleHeight, pagerDrift],
	);
	const [pickerPhase, setPickerPhase] = useState<HomeListPickerPhase>("closed");
	const [selectionPending, setSelectionPending] = useState(false);

	async function focusList(listId: string): Promise<boolean> {
		if (selectionPending) return false;
		setSelectionPending(true);
		try {
			return await onFocusList(listId);
		} finally {
			setSelectionPending(false);
		}
	}

	return (
		<>
			<Pressable
				accessibilityLabel="Choose List"
				accessibilityRole="button"
				onPress={() => setPickerPhase("open")}
			/>
			<Pressable
				accessibilityLabel="Close List picker"
				accessibilityRole="button"
				onPress={() => setPickerPhase("closing")}
			/>
			<HomeListPager
				{...props}
				addItemRequest={null}
				collapsedTitleScroll={collapsedTitleScroll}
				editorFinishPending={false}
				pickerPhase={pickerPhase}
				selectionPending={selectionPending}
				onFocusList={focusList}
				onItemEditorEvent={jest.fn()}
				onPickerPhaseChange={setPickerPhase}
				onRetry={jest.fn()}
			/>
		</>
	);
}

type TestHomeListPagerProps = Omit<
	HomeListPagerProps,
	| "addItemRequest"
	| "collapsedTitleScroll"
	| "editorFinishPending"
	| "pickerPhase"
	| "selectionPending"
	| "onItemEditorEvent"
	| "onPickerPhaseChange"
	| "onRetry"
>;

/**
 * Carousel assertions re-render before reading the animated style: the
 * Reanimated double evaluates animated styles during render instead of on the
 * UI thread (see `src/test/mocks/reanimated.ts`). Each call returns a fresh
 * element so React cannot bail out of the re-render.
 */
function pagedListSurface() {
	return (
		<TestHomeListPager
			session={authenticatedAppSession}
			{...activeListProps([groceriesListSummary, pantryListSummary])}
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

/**
 * Drives the picker from the harness stand-in for the native bottom toolbar.
 * Hidden elements count: an open picker is `accessibilityViewIsModal`, which
 * masks its siblings, while the real toolbar renders outside this tree
 * entirely and stays reachable.
 */
async function openListPicker(): Promise<void> {
	await fireEvent.press(
		screen.getByRole("button", {
			name: "Choose List",
			includeHiddenElements: true,
		}),
	);
}

async function closeListPicker(): Promise<void> {
	await fireEvent.press(
		screen.getByRole("button", {
			name: "Close List picker",
			includeHiddenElements: true,
		}),
	);
}

/**
 * Lands the picker zoom the way the springs land it on the UI thread, which is
 * what releases the receding surface to unmount (see
 * `src/test/mocks/reanimated.ts`).
 */
async function settleListPickerZoom(): Promise<void> {
	await act(async () => {
		settleAnimations();
	});
}

/**
 * How far the picker zoom has scaled this surface toward or away from full
 * size. Hidden elements count: the picker's `accessibilityViewIsModal` masks
 * the receding List surface from assistive technology and from queries.
 */
function surfaceScale(testID: string): number {
	const style = StyleSheet.flatten<ViewStyle>(
		screen.getByTestId(testID, { includeHiddenElements: true }).props.style,
	);
	const transforms = style.transform;
	if (!Array.isArray(transforms)) {
		throw new Error(`${testID} is not carrying a picker zoom transform`);
	}
	for (const entry of transforms) {
		if (typeof entry.scale === "number") return entry.scale;
	}
	throw new Error(`${testID} is not carrying a picker zoom scale`);
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

function activeListProps(
	summaries = [groceriesListSummary],
): HomeListPagerDataProps {
	return {
		collectionState: {
			status: "active",
			summaries,
			currentListId: "lst_groceries",
		},
		syncState: "synced",
	};
}

function zeroActiveListProps(): HomeListPagerDataProps {
	return {
		collectionState: { status: "zeroActive" },
		syncState: "synced",
	};
}

type HomeListPagerDataProps = Pick<
	HomeListPagerProps,
	"collectionState" | "syncState"
>;
