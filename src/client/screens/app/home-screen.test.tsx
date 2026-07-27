import { render, screen } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { NavigationDrawerProvider } from "@/client/app-shell/navigation-drawer-context";
import {
	activeListPage,
	authenticatedAppSession,
	groceriesListSummary,
} from "@/client/features/list/list-test-support";
import type {
	ListCollection,
	ListCollectionState,
} from "@/client/features/list/use-list-collection";
import { useListCollection } from "@/client/features/list/use-list-collection";
import { useListPage } from "@/client/features/list/use-list-page";
import { useAuthenticatedAppSession, useSyncState } from "@/client/session";
import { TestSafeAreaProvider } from "@/test/safe-area";
import HomeScreen, { HomeScreenView } from "./home-screen";

const mockReplace = jest.fn();
const mockSelectList = jest.fn(async (_input: { listId: string }) => ({
	status: "selected" as const,
}));

jest.mock("expo-router", () => {
	const React = jest.requireActual<typeof import("react")>("react");
	const ReactNative =
		jest.requireActual<typeof import("react-native")>("react-native");
	function Screen({ options }: { options?: { title?: string } }) {
		return options?.title
			? React.createElement(
					ReactNative.Text,
					{ accessibilityRole: "header" },
					options.title,
				)
			: null;
	}
	function Title({ children }: PropsWithChildren) {
		return children;
	}
	function Toolbar({ children }: PropsWithChildren) {
		return children;
	}
	Toolbar.Button = function ToolbarButton() {
		return null;
	};
	Toolbar.Spacer = function ToolbarSpacer() {
		return null;
	};
	Toolbar.View = function ToolbarView({ children }: PropsWithChildren) {
		return children;
	};
	return {
		Stack: { Screen, Title, Toolbar },
		useRouter: () => ({ replace: mockReplace }),
	};
});

jest.mock("expo-router/build/react-navigation/elements", () => ({
	useHeaderHeight: () => 116,
}));

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

jest.mock("react-native-gesture-handler", () =>
	jest.requireActual("@/test/mocks/gesture-handler"),
);

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
	jest
		.mocked(useListPage)
		.mockImplementation((_session, summary) => activeListPage(summary));
	mockSelectList.mockReset();
	mockSelectList.mockResolvedValue({ status: "selected" });
	jest.mocked(useListCollection).mockReturnValue(
		collectionFixture({
			status: "active",
			summaries: [groceriesListSummary],
			currentListId: "lst_groceries",
		}),
	);
});

describe("HomeScreenView", () => {
	it("renders the loading Authenticated App Session state", async () => {
		await render(<HomeScreenView state={{ status: "loading" }} />);
		expect(screen.getByText("Preparing your Household")).toBeTruthy();
	});
});

describe("HomeScreen", () => {
	it("renders the Current List and calls the collection once", async () => {
		await render(
			<NavigationDrawerProvider open={jest.fn()}>
				<HomeScreen />
			</NavigationDrawerProvider>,
			{ wrapper: TestSafeAreaProvider },
		);
		expect(screen.getByRole("header", { name: "Groceries" })).toBeTruthy();
		expect(useListCollection).toHaveBeenCalledTimes(1);
		expect(useListCollection).toHaveBeenCalledWith(authenticatedAppSession);
	});

	it("uses the collection state to render an empty Household", async () => {
		jest
			.mocked(useListCollection)
			.mockReturnValue(collectionFixture({ status: "zeroActive" }));
		await render(
			<NavigationDrawerProvider open={jest.fn()}>
				<HomeScreen />
			</NavigationDrawerProvider>,
			{ wrapper: TestSafeAreaProvider },
		);
		expect(screen.getByRole("header", { name: "Home" })).toBeTruthy();
		expect(screen.getByText("No active Lists")).toBeTruthy();
	});
});

function collectionFixture(state: ListCollectionState): ListCollection {
	return {
		state,
		actions: {
			retry: jest.fn(),
			selectList: mockSelectList,
			createList: jest.fn(async () => ({ status: "failed" as const })),
			renameList: jest.fn(async () => ({ status: "failed" as const })),
			deleteList: jest.fn(async () => ({ status: "failed" as const })),
		},
	};
}
