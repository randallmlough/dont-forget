import { fireEvent, render, screen } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationDrawerProvider } from "@/client/app-shell/navigation-drawer-context";
import type { HomeCurrentListDeps } from "@/client/features/list/current-list";
import {
	authenticatedAppSession,
	emptyActiveListState,
} from "@/client/features/list/list-test-support";
import { useHomeCurrentList } from "@/client/features/list/use-home-current-list";
import { useListRows } from "@/client/features/list/use-list-rows";
import { useAuthenticatedAppSession, useSyncState } from "@/client/session";
import HomeScreen, { HomeScreenView } from "./home-screen";

const mockReplace = jest.fn();

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

	function Screen() {
		return null;
	}

	return {
		Stack: { Screen, Title, Toolbar },
		useRouter: () => ({ replace: mockReplace }),
	};
});

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

jest.mock("@/client/session/powersync", () => ({
	PowerSyncConnector: jest.fn(),
	powerSyncAppDatabase: {},
	readPowerSyncUrl: jest.fn(() => "https://sync.test"),
}));

beforeEach(() => {
	mockReplace.mockReset();
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
		rows: { status: "ready", summaries: [] },
	});
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
	it("passes the Current List name to the stack title and wires the drawer button", async () => {
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

	it("falls back to the Home title while the Current List is unresolved", async () => {
		jest.mocked(useHomeCurrentList).mockReturnValue({
			state: { status: "zeroActive" },
			retry: jest.fn(),
			reload: jest.fn(),
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
