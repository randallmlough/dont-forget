import { useAuth } from "@clerk/clerk-expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationDrawerProvider } from "@mobile/app-shell/navigation-drawer-context";
import { createUsersApiClient } from "@mobile/features/settings/api";
import { track } from "@mobile/lib/analytics";
import { useLogger } from "@mobile/lib/logger";
import type { AuthenticatedAppSession } from "@mobile/session";
import { useAuthenticatedAppSession } from "@mobile/session";
import { createMockLogger } from "@mobile/test/mocks/logger";
import ProfileScreen from "./profile-screen";

const mockBack = jest.fn();
const mockCanGoBack = jest.fn();
const mockReplace = jest.fn();
const mockReloadSession = jest.fn();
const mockSignOut = jest.fn(async () => undefined);
const mockUpdateUserName = jest.fn(async () => ({
	id: "usr_avery",
	email: "avery@example.com",
	displayName: "Avery Lough",
	firstName: "Avery",
	lastName: "Lough",
}));

jest.mock("expo-router", () => ({
	useRouter: () => ({
		back: mockBack,
		canGoBack: mockCanGoBack,
		replace: mockReplace,
	}),
}));
jest.mock("@clerk/clerk-expo", () => ({ useAuth: jest.fn() }));
jest.mock("@mobile/session", () => ({
	useAuthenticatedAppSession: jest.fn(),
}));
jest.mock("@mobile/features/settings/api", () => ({
	createUsersApiClient: jest.fn(),
}));
jest.mock("@mobile/lib/analytics", () =>
	jest.requireActual("@mobile/test/mocks/analytics"),
);
jest.mock("@mobile/lib/logger", () =>
	jest
		.requireActual<typeof import("@mobile/test/mocks/logger")>(
			"@mobile/test/mocks/logger",
		)
		.createMockLoggerModule(),
);

beforeEach(() => {
	mockBack.mockReset();
	mockCanGoBack.mockReset();
	mockCanGoBack.mockReturnValue(true);
	mockReplace.mockReset();
	mockReloadSession.mockReset();
	mockSignOut.mockClear();
	mockUpdateUserName.mockClear();
	jest.mocked(track).mockClear();
	jest.mocked(useLogger).mockReturnValue(createMockLogger());
	jest.mocked(useAuth).mockReturnValue({
		getToken: jest.fn(async () => "session-token"),
	} as unknown as ReturnType<typeof useAuth>);
	jest.mocked(createUsersApiClient).mockReturnValue({
		updateUserName: mockUpdateUserName,
	});
	jest.mocked(useAuthenticatedAppSession).mockReturnValue({
		state: { status: "ready", refreshing: false },
		session: authenticatedAppSessionFixture(),
		retry: jest.fn(),
		reloadSession: mockReloadSession,
		signOut: mockSignOut,
	});
	jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
});

describe("ProfileScreen", () => {
	it("renders supported User fields without unsupported credential controls", async () => {
		await renderProfile();

		expect(screen.getByText("Avery Chen")).toBeTruthy();
		expect(screen.getAllByText("avery@example.com").length).toBeGreaterThan(0);
		expect(screen.getByText("First Name")).toBeTruthy();
		expect(screen.getByText("Last Name")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Sign Out" })).toBeTruthy();
		expect(screen.queryByText("Password")).toBeNull();
		expect(screen.queryByText("Delete User")).toBeNull();
	});

	it("updates the User name from the dedicated Profile page", async () => {
		await renderProfile();

		await fireEvent.press(screen.getByRole("button", { name: "Edit" }));
		await fireEvent.changeText(screen.getByLabelText("First name"), "Avery");
		await fireEvent.changeText(screen.getByLabelText("Last name"), "Lough");
		await fireEvent.press(screen.getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(mockUpdateUserName).toHaveBeenCalledWith({
				firstName: "Avery",
				lastName: "Lough",
			}),
		);
		expect(mockReloadSession).toHaveBeenCalledTimes(1);
		expect(track).toHaveBeenCalledWith("user_name_updated", {
			user_id: "usr_avery",
		});
	});

	it("requires a first or last name before saving", async () => {
		await renderProfile();
		await fireEvent.press(screen.getByRole("button", { name: "Edit" }));
		await fireEvent.changeText(screen.getByLabelText("First name"), " ");
		await fireEvent.changeText(screen.getByLabelText("Last name"), " ");
		await fireEvent.press(screen.getByRole("button", { name: "Save" }));

		expect(mockUpdateUserName).not.toHaveBeenCalled();
		expect(screen.getByText("Provide a first or last name.")).toBeTruthy();
	});

	it("returns Home before signing out", async () => {
		await renderProfile();
		await fireEvent.press(screen.getByRole("button", { name: "Sign Out" }));

		expect(mockReplace).toHaveBeenCalledWith("/");
		expect(mockReplace.mock.invocationCallOrder[0]).toBeLessThan(
			mockSignOut.mock.invocationCallOrder[0],
		);
	});

	it("uses native back navigation", async () => {
		await renderProfile();
		await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
		expect(mockBack).toHaveBeenCalledTimes(1);
	});

	it("returns to Settings when opened directly from the drawer", async () => {
		mockCanGoBack.mockReturnValue(false);
		await renderProfile();

		await fireEvent.press(screen.getByRole("button", { name: "Go back" }));

		expect(mockReplace).toHaveBeenCalledWith("/settings");
		expect(mockBack).not.toHaveBeenCalled();
	});
});

function renderProfile() {
	return render(<ProfileScreen />, { wrapper: TestProvider });
}

function TestProvider({ children }: PropsWithChildren) {
	return (
		<SafeAreaProvider
			initialMetrics={{
				frame: { x: 0, y: 0, width: 390, height: 844 },
				insets: { top: 47, right: 0, bottom: 34, left: 0 },
			}}
		>
			<NavigationDrawerProvider open={jest.fn()}>
				{children}
			</NavigationDrawerProvider>
		</SafeAreaProvider>
	);
}

function authenticatedAppSessionFixture(): AuthenticatedAppSession {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
			firstName: "Avery",
			lastName: "Chen",
		},
		activeHousehold: { id: "hh_avery", name: "Avery Household" },
		households: [],
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner",
			displayName: "Avery Chen",
		},
		members: [],
	};
}
