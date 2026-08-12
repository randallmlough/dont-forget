import { track } from "@mobile/lib/analytics";
import type { AuthenticatedAppSession } from "@mobile/session";
import { useAuthenticatedAppSession } from "@mobile/session";
import {
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppShellLayout } from "./app-shell-layout";
import { NavigationDrawer } from "./navigation-drawer";

const mockReplace = jest.fn();
const mockUsePathname = jest.fn(() => "/");

jest.mock("react-native", () => {
	const React = jest.requireActual<typeof import("react")>("react");
	const reactNative =
		jest.requireActual<typeof import("react-native")>("react-native");

	function Modal({
		children,
		...props
	}: import("react-native").ModalProps & { children?: React.ReactNode }) {
		return React.createElement(reactNative.View, props, children);
	}

	return new Proxy(reactNative, {
		get(target, property, receiver) {
			if (property === "Modal") return Modal;
			return Reflect.get(target, property, receiver);
		},
	});
});

jest.mock("expo-status-bar", () => {
	const React = jest.requireActual<typeof import("react")>("react");
	const { View } =
		jest.requireActual<typeof import("react-native")>("react-native");

	return {
		StatusBar: (props: { hidden?: boolean }) =>
			React.createElement(View, {
				...props,
				testID: "drawer-status-bar-override",
			}),
	};
});

jest.mock("expo-router", () => {
	const React = jest.requireActual<typeof import("react")>("react");
	const { Pressable, Text } =
		jest.requireActual<typeof import("react-native")>("react-native");
	const { useNavigationDrawer } = jest.requireActual<
		typeof import("./navigation-drawer-context")
	>("./navigation-drawer-context");

	function Stack() {
		const { open } = useNavigationDrawer();
		return React.createElement(
			Pressable,
			{
				accessibilityRole: "button",
				onPress: open,
			},
			React.createElement(Text, null, "Open test navigation"),
		);
	}

	return {
		Stack,
		usePathname: () => mockUsePathname(),
		useRouter: () => ({ replace: mockReplace }),
	};
});

jest.mock("@mobile/session", () => ({
	sessionMemberDisplayName: (session: AuthenticatedAppSession | null) =>
		session?.activeMember.displayName ?? "Member",
	useAuthenticatedAppSession: jest.fn(),
}));

jest.mock("@mobile/lib/analytics", () =>
	jest.requireActual("@mobile/test/mocks/analytics"),
);

beforeEach(() => {
	mockReplace.mockReset();
	mockUsePathname.mockReturnValue("/");
	jest.mocked(track).mockClear();
	jest.mocked(useAuthenticatedAppSession).mockReturnValue({
		state: { status: "ready", refreshing: false },
		session: sessionFixture(),
		retry: jest.fn(),
		reloadSession: jest.fn(),
		signOut: jest.fn(),
	});
});

describe("NavigationDrawer", () => {
	it("hides the status bar until the native drawer finishes dismissing", async () => {
		await render(<AppShellLayout />, {
			wrapper: TestSafeAreaProvider,
		});

		expect(screen.queryByTestId("drawer-status-bar-override")).toBeNull();

		await fireEvent.press(
			screen.getByRole("button", { name: "Open test navigation" }),
		);

		expect(screen.getByTestId("drawer-status-bar-override").props.hidden).toBe(
			true,
		);

		await fireEvent.press(
			screen.getByRole("button", { name: "Close navigation" }),
		);

		expect(screen.getByTestId("navigation-drawer-modal").props.visible).toBe(
			false,
		);
		expect(screen.getByTestId("drawer-status-bar-override").props.hidden).toBe(
			true,
		);

		await fireEvent(screen.getByTestId("navigation-drawer-modal"), "dismiss");

		await waitFor(() => {
			expect(screen.queryByTestId("navigation-drawer-modal")).toBeNull();
			expect(screen.queryByTestId("drawer-status-bar-override")).toBeNull();
		});
	});

	it("waits for native dismissal before replacing the destination", async () => {
		await render(<AppShellLayout />, {
			wrapper: TestSafeAreaProvider,
		});
		await fireEvent.press(
			screen.getByRole("button", { name: "Open test navigation" }),
		);

		await fireEvent.press(screen.getByRole("button", { name: "Settings" }));

		expect(screen.getByTestId("navigation-drawer-modal").props.visible).toBe(
			false,
		);
		expect(mockReplace).not.toHaveBeenCalled();

		await fireEvent(screen.getByTestId("navigation-drawer-modal"), "dismiss");

		expect(track).toHaveBeenCalledWith("settings_opened", {
			source: "navigation_drawer",
		});
		expect(mockReplace).toHaveBeenCalledWith("/settings");
		await waitFor(() =>
			expect(screen.queryByTestId("navigation-drawer-modal")).toBeNull(),
		);
	});

	it("renders all app destinations", async () => {
		await render(<NavigationDrawer isOpen onClose={jest.fn()} />, {
			wrapper: TestSafeAreaProvider,
		});

		for (const label of [
			"Home",
			"Lists",
			"Household",
			"Members & Invitations",
			"Settings",
			"Appearance",
			"Switch Household",
			"Profile",
		]) {
			expect(screen.getByRole("button", { name: label })).toBeTruthy();
		}
	});

	it("closes without navigating when the destination is current", async () => {
		const onClose = jest.fn();
		mockUsePathname.mockReturnValue("/lists");
		await render(<NavigationDrawer isOpen onClose={onClose} />, {
			wrapper: TestSafeAreaProvider,
		});

		await fireEvent.press(screen.getByRole("button", { name: "Lists" }));

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("renders nothing without an Authenticated App Session", async () => {
		jest.mocked(useAuthenticatedAppSession).mockReturnValue({
			state: { status: "loading" },
			session: null,
			retry: jest.fn(),
			reloadSession: jest.fn(),
			signOut: jest.fn(),
		});

		await render(<NavigationDrawer isOpen onClose={jest.fn()} />);

		expect(screen.queryByTestId("navigation-drawer-modal")).toBeNull();
	});
});

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

function sessionFixture(): AuthenticatedAppSession {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
			firstName: "Avery",
			lastName: "Chen",
		},
		activeHousehold: { id: "hh_avery", name: "Juniper House" },
		households: [
			{
				id: "hh_avery",
				name: "Juniper House",
				role: "owner",
				isActive: true,
			},
		],
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner",
			displayName: "Avery Chen",
		},
		members: [],
	};
}
