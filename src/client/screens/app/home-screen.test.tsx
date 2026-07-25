import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { Dimensions } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationDrawerProvider } from "@/client/app-shell/navigation-drawer-context";
import type { HomeCurrentListDeps } from "@/client/features/list/current-list";
import {
	authenticatedAppSession,
	emptyActiveListState,
	groceriesListSummary,
	pantryListSummary,
} from "@/client/features/list/list-test-support";
import { useHomeCurrentList } from "@/client/features/list/use-home-current-list";
import { useListPage } from "@/client/features/list/use-list-page";
import { useListRows } from "@/client/features/list/use-list-rows";
import { useSelectList } from "@/client/features/list/use-select-list";
import { useAuthenticatedAppSession, useSyncState } from "@/client/session";
import HomeScreen, { HomeScreenView } from "./home-screen";

const mockReplace = jest.fn();
const mockSelectList = jest.fn(async () => true);
const mockStackScreenOptions = jest.fn();
const mockUseHeaderHeight = jest.fn(() => 116);
const hardwareListSummary = {
	...pantryListSummary,
	id: "lst_hardware",
	name: "Hardware",
};

jest.mock("expo-router", () => {
	const mockReact = jest.requireActual<typeof import("react")>("react");
	const mockReactNative =
		jest.requireActual<typeof import("react-native")>("react-native");

	function Title({ children }: PropsWithChildren) {
		return mockReact.createElement(
			mockReactNative.Text,
			{ accessibilityRole: "header" },
			children,
		);
	}

	function Toolbar({ children }: PropsWithChildren) {
		return children;
	}

	Toolbar.Button = function ToolbarButton({
		accessibilityHint,
		accessibilityLabel,
		onPress,
	}: {
		accessibilityHint?: string;
		accessibilityLabel?: string;
		onPress?: () => void;
	}) {
		return mockReact.createElement(mockReactNative.Pressable, {
			accessibilityHint,
			accessibilityLabel,
			accessibilityRole: "button",
			onPress,
		});
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
	useHeaderHeight: () => mockUseHeaderHeight(),
}));

// useAuthenticatedAppSession, useSyncState, useHomeCurrentList, and
// useListRows all sit on the PowerSync watched-query and native-session
// boundary, which has no deterministic local harness. The seam under test in
// this file is the screen's stack title and toolbar wiring, not List loading;
// List behavior runs against the real components in current-list.test.tsx.
// Justification per docs/code-standards/testing.md:9.
jest.mock("@/client/session", () => ({
	...jest.requireActual("@/client/session"),
	useAuthenticatedAppSession: jest.fn(),
	useSyncState: jest.fn(),
}));

jest.mock("@/client/features/list/use-home-current-list", () => ({
	useHomeCurrentList: jest.fn(),
}));

jest.mock("@/client/features/list/use-list-rows", () => ({
	useListRows: jest.fn(),
}));

jest.mock("@/client/features/list/use-list-page", () => ({
	useListPage: jest.fn(),
}));

jest.mock("@/client/features/list/use-select-list", () => ({
	useSelectList: jest.fn(),
}));

jest.mock("@/client/session/powersync", () => ({
	PowerSyncConnector: jest.fn(),
	powerSyncAppDatabase: {},
	readPowerSyncUrl: jest.fn(() => "https://sync.test"),
}));

beforeEach(() => {
	mockReplace.mockReset();
	mockStackScreenOptions.mockClear();
	mockUseHeaderHeight.mockReturnValue(116);
	jest.mocked(useAuthenticatedAppSession).mockReturnValue({
		state: { status: "ready", refreshing: false },
		session: authenticatedAppSession,
		retry: jest.fn(),
		reloadSession: jest.fn(),
		signOut: jest.fn(),
	});
	jest.mocked(useSyncState).mockReturnValue("synced");
	jest.mocked(useHomeCurrentList).mockReturnValue(activeCurrentList());
	jest.mocked(useListRows).mockReturnValue({
		rows: { status: "ready", summaries: [groceriesListSummary] },
	});
	jest.mocked(useListPage).mockImplementation((_session, summary) => ({
		status: "active",
		listId: summary.id,
		list: { ...emptyActiveListState, listName: summary.name },
		actions: {
			addItem: jest.fn(async () => undefined),
			setItemChecked: jest.fn(async () => undefined),
		},
	}));
	mockSelectList.mockReset();
	mockSelectList.mockResolvedValue(true);
	jest.mocked(useSelectList).mockReturnValue(mockSelectList);
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

		await act(async () => {
			fireEvent(screen.getByTestId("home-list-items-lst_groceries"), "scroll", {
				nativeEvent: {
					contentOffset: { x: 0, y: 96 },
					contentSize: { width: 390, height: 1200 },
					layoutMeasurement: { width: 390, height: 844 },
				},
			});
		});

		expect(mockStackScreenOptions).toHaveBeenLastCalledWith(
			expect.objectContaining({
				headerTransparent: true,
				title: "",
			}),
		);
	});

	it("updates the page title and persists selection when paging settles", async () => {
		jest.mocked(useListRows).mockReturnValue({
			rows: {
				status: "ready",
				summaries: [groceriesListSummary, pantryListSummary],
			},
		});
		await render(
			<NavigationDrawerProvider open={jest.fn()}>
				<HomeScreen />
			</NavigationDrawerProvider>,
			{ wrapper: TestSafeAreaProvider },
		);
		await settlePagerAt(1);

		expect(await screen.findByRole("header", { name: "Pantry" })).toBeTruthy();
		expect(mockSelectList).toHaveBeenCalledWith("lst_pantry", "lst_groceries");
	});

	it("insets every List page below the transparent stack header", async () => {
		jest.mocked(useListRows).mockReturnValue({
			rows: {
				status: "ready",
				summaries: [groceriesListSummary, pantryListSummary],
			},
		});
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
			expect(
				screen.getByTestId(`home-list-sticky-title-${listId}`, {
					includeHiddenElements: true,
				}),
			).toHaveStyle({ height: 116 });
		}
	});

	it("reverts the focused List when persisting the selection fails", async () => {
		jest.mocked(useListRows).mockReturnValue({
			rows: {
				status: "ready",
				summaries: [groceriesListSummary, pantryListSummary],
			},
		});
		mockSelectList.mockResolvedValue(false);
		await render(
			<NavigationDrawerProvider open={jest.fn()}>
				<HomeScreen />
			</NavigationDrawerProvider>,
			{ wrapper: TestSafeAreaProvider },
		);

		await settlePagerAt(1);

		expect(mockSelectList).toHaveBeenCalledWith("lst_pantry", "lst_groceries");
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
		jest.mocked(useListRows).mockReturnValue({
			rows: {
				status: "ready",
				summaries: [
					groceriesListSummary,
					pantryListSummary,
					hardwareListSummary,
				],
			},
		});
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
		expect(mockSelectList).toHaveBeenNthCalledWith(
			2,
			"lst_hardware",
			"lst_pantry",
		);
	});

	it("falls back to the Home title while the Current List is unresolved", async () => {
		jest.mocked(useHomeCurrentList).mockReturnValue({
			state: { status: "zeroActive" },
			retry: jest.fn(),
			reload: jest.fn(),
		});
		jest.mocked(useListRows).mockReturnValue({
			rows: { status: "ready", summaries: [] },
		});

		await render(
			<NavigationDrawerProvider open={jest.fn()}>
				<HomeScreen />
			</NavigationDrawerProvider>,
			{ wrapper: TestSafeAreaProvider },
		);

		expect(await screen.findByRole("header", { name: "Home" })).toBeTruthy();
		expect(await screen.findByText("No active Lists")).toBeTruthy();
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

async function settlePagerAt(index: number): Promise<void> {
	await act(async () => {
		fireEvent(screen.getByTestId("home-list-pager"), "momentumScrollEnd", {
			nativeEvent: {
				contentOffset: { x: index * Dimensions.get("window").width, y: 0 },
			},
		});
	});
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

function activeCurrentList(): HomeCurrentListDeps["currentList"] {
	return {
		state: {
			status: "active",
			listId: "lst_groceries",
			list: emptyActiveListState,
			actions: {
				addItem: jest.fn(async () => undefined),
				setItemChecked: jest.fn(async () => undefined),
			},
		},
		retry: jest.fn(),
		reload: jest.fn(),
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
