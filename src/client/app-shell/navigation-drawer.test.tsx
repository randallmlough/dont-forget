import { fireEvent, render, screen } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { track } from "@/client/lib/analytics";
import type { AuthenticatedAppSession } from "@/client/session";
import { useAuthenticatedAppSession } from "@/client/session";
import { NavigationDrawer } from "./navigation-drawer";

const mockReplace = jest.fn();
const mockUsePathname = jest.fn(() => "/");

jest.mock("expo-router", () => ({
	usePathname: () => mockUsePathname(),
	useRouter: () => ({ replace: mockReplace }),
}));

jest.mock("@/client/session", () => ({
	sessionMemberDisplayName: (session: AuthenticatedAppSession | null) =>
		session?.activeMember.displayName ?? "Member",
	useAuthenticatedAppSession: jest.fn(),
}));

jest.mock("@/client/lib/analytics", () =>
	jest.requireActual("@/test/mocks/analytics"),
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
	it("waits for native dismissal before replacing the destination", async () => {
		const onClose = jest.fn();
		await render(<NavigationDrawer isOpen onClose={onClose} />, {
			wrapper: TestSafeAreaProvider,
		});

		await fireEvent.press(screen.getByRole("button", { name: "Settings" }));

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(mockReplace).not.toHaveBeenCalled();

		await fireEvent(
			screen.getByTestId("navigation-drawer-modal"),
			"dismiss",
		);

		expect(track).toHaveBeenCalledWith("settings_opened", {
			source: "navigation_drawer",
		});
		expect(mockReplace).toHaveBeenCalledWith("/settings");
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
