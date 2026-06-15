import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { WebBrowserResultType } from "expo-web-browser";
import type { PropsWithChildren, ReactElement } from "react";
import { Linking, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { UnistylesRuntime } from "react-native-unistyles";

import { useAuthenticatedAppSession } from "@/components/session";
import { track } from "@/lib/analytics";
import { createUsersApiClient } from "@/lib/client-api/users";
import {
	registerForPushNotifications,
	unregisterPushNotifications,
} from "@/lib/push/registration";
import type { ItemService } from "@/lib/services/item";
import type { ListService } from "@/lib/services/list";
import type {
	AuthenticatedAppSession,
	AuthenticatedAppSessionSync,
} from "@/lib/services/session";
import SettingsScreen from "./settings-screen";

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockSignOut = jest.fn(async () => undefined);
const mockDeleteUser = jest.fn(async () => ({ deletedHouseholdCount: 1 }));
const mockSendTestNotification = jest.fn(async () => ({
	sent: 1,
	disabled: 0,
}));
const mockUpdateUserName = jest.fn();
const devClientHeaderActionGutter = 56;
const setAdaptiveThemesSpy = jest
	.spyOn(UnistylesRuntime, "setAdaptiveThemes")
	.mockImplementation(() => undefined);
const setThemeSpy = jest
	.spyOn(UnistylesRuntime, "setTheme")
	.mockImplementation(() => undefined);

jest.mock("expo-constants", () => ({
	__esModule: true,
	default: {
		expoConfig: {
			version: "1.2.3",
			extra: {
				appEnv: "local",
				privacyPolicyUrl: "https://example.com/privacy",
				termsUrl: "https://example.com/terms",
			},
		},
	},
}));

jest.mock("expo-router", () => ({
	useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}));

jest.mock("@clerk/clerk-expo", () => ({
	useAuth: () => ({ getToken: jest.fn(async () => "token") }),
}));

jest.mock("@/components/session", () => ({
	useAuthenticatedAppSession: jest.fn(),
}));

jest.mock("@/lib/client-api/users", () => ({
	createUsersApiClient: jest.fn(() => ({
		completeOnboarding: jest.fn(async () => undefined),
		deleteUser: mockDeleteUser,
		registerPushToken: jest.fn(async () => undefined),
		unregisterPushToken: jest.fn(async () => undefined),
		sendTestNotification: mockSendTestNotification,
		updateUserName: mockUpdateUserName,
	})),
}));

jest.mock("@/lib/analytics", () =>
	jest.requireActual("@/lib/test/mocks/analytics"),
);

jest.mock("@/lib/push/registration", () => ({
	registerForPushNotifications: jest.fn(),
	unregisterPushNotifications: jest.fn(async () => undefined),
}));

beforeEach(() => {
	mockRouterPush.mockReset();
	mockRouterReplace.mockReset();
	mockSignOut.mockClear();
	mockDeleteUser.mockClear();
	mockDeleteUser.mockResolvedValue({ deletedHouseholdCount: 1 });
	mockSendTestNotification.mockClear();
	mockUpdateUserName.mockReset();
	mockUpdateUserName.mockResolvedValue({
		id: "usr_1",
		email: "avery@example.com",
		displayName: "Avery Chen",
		firstName: "Avery",
		lastName: "Chen",
	});
	setAdaptiveThemesSpy.mockClear();
	setThemeSpy.mockClear();
	jest.mocked(createUsersApiClient).mockClear();
	jest.mocked(track).mockClear();
	jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
	jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
	jest.mocked(Linking.openSettings).mockResolvedValue(undefined);
	jest.mocked(registerForPushNotifications).mockResolvedValue({
		status: "registered",
		expoPushToken: "ExponentPushToken[one]",
	});
	jest.mocked(unregisterPushNotifications).mockResolvedValue(undefined);
	jest.mocked(WebBrowser.openBrowserAsync).mockResolvedValue({
		type: WebBrowserResultType.OPENED,
	});
	jest.mocked(useAuthenticatedAppSession).mockReturnValue({
		state: { status: "ready", refreshing: false },
		session: sessionFixture(),
		markOnboardingComplete() {},
		retry() {},
		reloadSession() {},
		signOut: mockSignOut,
	});
	setExpoConfig({
		version: "1.2.3",
		extra: {
			appEnv: "local",
			privacyPolicyUrl: "https://example.com/privacy",
			termsUrl: "https://example.com/terms",
		},
	});
});

describe("SettingsScreen", () => {
	it("renders settings sections and configured legal rows", async () => {
		await renderWithSafeArea(<SettingsScreen />);

		expect(screen.getByText("User")).toBeTruthy();
		expect(screen.getByText("Name")).toBeTruthy();
		expect(screen.getByText("Avery User")).toBeTruthy();
		expect(screen.getByText("Household settings")).toBeTruthy();
		expect(screen.getByText("Delete Account")).toBeTruthy();
		expect(screen.getAllByText("Appearance").length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText("Notifications").length).toBeGreaterThanOrEqual(
			1,
		);
		expect(screen.getByText("Send test notification")).toBeTruthy();
		expect(screen.getByText("About")).toBeTruthy();
		expect(screen.getByText("Privacy Policy")).toBeTruthy();
		expect(screen.getByText("Terms of Service")).toBeTruthy();
		expect(screen.getByText("Version")).toBeTruthy();
		expect(screen.getByText("1.2.3 (local)")).toBeTruthy();
		await waitFor(() =>
			expect(track).toHaveBeenCalledWith("settings_opened", { source: "home" }),
		);
	});

	it("hides legal rows when public URLs are unset", async () => {
		setExpoConfig({
			version: "1.2.3",
			extra: { appEnv: "production" },
		});

		await renderWithSafeArea(<SettingsScreen />);

		expect(screen.queryByText("Privacy Policy")).toBeNull();
		expect(screen.queryByText("Terms of Service")).toBeNull();
		expect(screen.queryByText("Send test notification")).toBeNull();
		expect(screen.getByText("1.2.3")).toBeTruthy();
	});

	it("opens configured legal URLs", async () => {
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(screen.getByText("Privacy Policy"));
		await fireEvent.press(screen.getByText("Terms of Service"));

		expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
			"https://example.com/privacy",
		);
		expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
			"https://example.com/terms",
		);
	});

	it("navigates to Household settings", async () => {
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(screen.getByText("Household settings"));

		expect(mockRouterPush).toHaveBeenCalledWith("/household/settings");
	});

	it("shows a Home control that returns to Home", async () => {
		await renderWithSafeArea(<SettingsScreen />);

		const headerAction = screen.getByTestId("settings-header-action");

		expect(StyleSheet.flatten(headerAction.props.style)).toMatchObject({
			paddingRight: devClientHeaderActionGutter,
		});
		expect(screen.getByText("Home")).toBeTruthy();

		await fireEvent.press(screen.getByRole("button", { name: "Back to Home" }));

		expect(mockRouterReplace).toHaveBeenCalledWith("/");
	});

	it("invokes authenticated app session sign-out", async () => {
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		expect(mockSignOut).toHaveBeenCalledTimes(1);
	});

	it("requires typed confirmation before deleting the User", async () => {
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(
			screen.getByRole("button", { name: "Delete Account" }),
		);

		const deleteButton = screen.getByRole("button", {
			name: "Permanently delete account",
		});
		expect(deleteButton.props.accessibilityState).toMatchObject({
			disabled: true,
		});

		await fireEvent.changeText(
			screen.getByLabelText("Type DELETE to confirm"),
			"delete",
		);
		expect(deleteButton.props.accessibilityState).toMatchObject({
			disabled: true,
		});

		await fireEvent.changeText(
			screen.getByLabelText("Type DELETE to confirm"),
			"DELETE",
		);
		expect(deleteButton.props.accessibilityState).toMatchObject({
			disabled: false,
		});
	});

	it("deletes the User, tracks the outcome, then signs out", async () => {
		mockDeleteUser.mockResolvedValue({ deletedHouseholdCount: 2 });
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(
			screen.getByRole("button", { name: "Delete Account" }),
		);
		await fireEvent.changeText(
			screen.getByLabelText("Type DELETE to confirm"),
			"DELETE",
		);
		await fireEvent.press(
			screen.getByRole("button", { name: "Permanently delete account" }),
		);

		await waitFor(() => expect(mockDeleteUser).toHaveBeenCalledTimes(1));
		expect(track).toHaveBeenCalledWith("user_deleted", {
			user_id: "usr_1",
			deleted_household_count: 2,
		});
		expect(mockSignOut).toHaveBeenCalledTimes(1);
	});

	it("does not show server deletion failure copy when sign-out cleanup fails after deletion", async () => {
		mockSignOut.mockRejectedValueOnce(new Error("local cleanup failed"));
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(
			screen.getByRole("button", { name: "Delete Account" }),
		);
		await fireEvent.changeText(
			screen.getByLabelText("Type DELETE to confirm"),
			"DELETE",
		);
		await fireEvent.press(
			screen.getByRole("button", { name: "Permanently delete account" }),
		);

		await waitFor(() => expect(mockDeleteUser).toHaveBeenCalledTimes(1));
		expect(track).toHaveBeenCalledWith("user_deleted", {
			user_id: "usr_1",
			deleted_household_count: 1,
		});
		expect(mockSignOut).toHaveBeenCalledTimes(1);
		expect(
			screen.queryByText("User deletion failed. Please try again."),
		).toBeNull();
	});

	it("retries User deletion when the deleted User no longer has an app session", async () => {
		mockDeleteUser.mockResolvedValue({ deletedHouseholdCount: 0 });
		jest.mocked(useAuthenticatedAppSession).mockReturnValue({
			state: { status: "error", message: "User has been deleted." },
			session: null,
			markOnboardingComplete() {},
			retry() {},
			reloadSession() {},
			signOut: mockSignOut,
		});
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(
			screen.getByRole("button", { name: "Delete Account" }),
		);
		await fireEvent.changeText(
			screen.getByLabelText("Type DELETE to confirm"),
			"DELETE",
		);
		await fireEvent.press(
			screen.getByRole("button", { name: "Permanently delete account" }),
		);

		await waitFor(() => expect(mockDeleteUser).toHaveBeenCalledTimes(1));
		expect(track).toHaveBeenCalledWith("user_deleted", {
			deleted_household_count: 0,
		});
		expect(mockSignOut).toHaveBeenCalledTimes(1);
	});

	it("shows a notice when User deletion fails", async () => {
		mockDeleteUser.mockRejectedValue(new Error("server down"));
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(
			screen.getByRole("button", { name: "Delete Account" }),
		);
		await fireEvent.changeText(
			screen.getByLabelText("Type DELETE to confirm"),
			"DELETE",
		);
		await fireEvent.press(
			screen.getByRole("button", { name: "Permanently delete account" }),
		);

		expect(
			await screen.findByText("User deletion failed. Please try again."),
		).toBeTruthy();
		expect(mockSignOut).not.toHaveBeenCalled();
	});

	it("hydrates saved profile names from the authenticated app session", async () => {
		jest.mocked(useAuthenticatedAppSession).mockReturnValue({
			state: { status: "ready", refreshing: false },
			session: sessionFixture({
				displayName: "QA006 Check",
				firstName: "QA006",
				lastName: "Check",
			}),
			markOnboardingComplete() {},
			retry() {},
			reloadSession() {},
			signOut: mockSignOut,
		});

		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(screen.getByText("Name"));

		expect(screen.getByLabelText("First name").props.value).toBe("QA006");
		expect(screen.getByLabelText("Last name").props.value).toBe("Check");
	});

	it("saves trimmed profile names and shows a success notice", async () => {
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(screen.getByText("Name"));
		await fireEvent.changeText(
			await screen.findByLabelText("First name"),
			"  Avery  ",
		);
		await fireEvent.changeText(screen.getByLabelText("Last name"), "  Chen  ");
		await fireEvent.press(screen.getByText("Save"));

		await waitFor(() =>
			expect(mockUpdateUserName).toHaveBeenCalledWith({
				firstName: "Avery",
				lastName: "Chen",
			}),
		);
		expect(await screen.findByText("User name updated.")).toBeTruthy();
		expect(track).toHaveBeenCalledWith("user_name_updated", {
			user_id: "usr_1",
		});
	});

	it("blocks profile saves with no first or last name", async () => {
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(screen.getByText("Name"));
		await screen.findByLabelText("First name");
		await fireEvent.press(screen.getByText("Save"));

		expect(mockUpdateUserName).not.toHaveBeenCalled();
		expect(screen.getByText("Provide a first or last name.")).toBeTruthy();
	});

	it("persists and tracks appearance changes", async () => {
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(screen.getByText("Dark"));

		await waitFor(() =>
			expect(AsyncStorage.setItem).toHaveBeenCalledWith(
				"appearance-preference",
				"dark",
			),
		);
		expect(setAdaptiveThemesSpy).toHaveBeenCalledWith(false);
		expect(setThemeSpy).toHaveBeenCalledWith("dark");
		expect(track).toHaveBeenCalledWith("appearance_preference_changed", {
			preference: "dark",
		});
	});

	it("applies each appearance option through Unistyles runtime", async () => {
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(screen.getByText("Light"));

		await waitFor(() => expect(setThemeSpy).toHaveBeenCalledWith("light"));
		expect(setAdaptiveThemesSpy).toHaveBeenCalledWith(false);

		setAdaptiveThemesSpy.mockClear();
		setThemeSpy.mockClear();

		await fireEvent.press(screen.getByText("System"));

		await waitFor(() =>
			expect(setAdaptiveThemesSpy).toHaveBeenCalledWith(true),
		);
		expect(setThemeSpy).not.toHaveBeenCalled();
	});

	it("registers for push notifications from the toggle", async () => {
		await renderWithSafeArea(<SettingsScreen />);

		await act(async () => {
			fireEvent(
				screen.getByRole("switch", { name: "Notifications" }),
				"valueChange",
				true,
			);
		});

		await waitFor(() =>
			expect(registerForPushNotifications).toHaveBeenCalledTimes(1),
		);
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(
			"notification-preference",
			JSON.stringify({
				enabled: true,
				expoPushToken: "ExponentPushToken[one]",
			}),
		);
		expect(track).toHaveBeenCalledWith("push_registration_changed", {
			enabled: true,
			outcome: "registered",
		});
	});

	it("opens iOS Settings when push permission is denied", async () => {
		jest.mocked(registerForPushNotifications).mockResolvedValue({
			status: "denied",
		});
		await renderWithSafeArea(<SettingsScreen />);

		await act(async () => {
			fireEvent(
				screen.getByRole("switch", { name: "Notifications" }),
				"valueChange",
				true,
			);
		});

		await waitFor(() => expect(Linking.openSettings).toHaveBeenCalledTimes(1));
		expect(
			screen.getByText(/Notifications are off in iOS Settings/),
		).toBeTruthy();
		expect(track).toHaveBeenCalledWith("push_registration_changed", {
			enabled: false,
			outcome: "denied",
		});
	});

	it("unregisters push notifications from the toggle", async () => {
		jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) => {
			if (key === "notification-preference") {
				return JSON.stringify({
					enabled: true,
					expoPushToken: "ExponentPushToken[one]",
				});
			}
			return null;
		});

		await renderWithSafeArea(<SettingsScreen />);

		await waitFor(() =>
			expect(
				screen.getByRole("switch", { name: "Notifications" }),
			).toBeTruthy(),
		);
		await act(async () => {
			fireEvent(
				screen.getByRole("switch", { name: "Notifications" }),
				"valueChange",
				false,
			);
		});

		await waitFor(() =>
			expect(unregisterPushNotifications).toHaveBeenCalledWith({
				client: expect.any(Object),
				expoPushToken: "ExponentPushToken[one]",
			}),
		);
		expect(track).toHaveBeenCalledWith("push_registration_changed", {
			enabled: false,
			outcome: "unregistered",
		});
	});
});

function renderWithSafeArea(element: ReactElement) {
	return render(element, { wrapper: TestSafeAreaProvider });
}

function TestSafeAreaProvider({ children }: PropsWithChildren) {
	return (
		<SafeAreaProvider
			initialMetrics={{
				frame: { x: 0, y: 0, width: 390, height: 844 },
				insets: { top: 47, right: 0, bottom: 34, left: 0 },
			}}
		>
			{children}
		</SafeAreaProvider>
	);
}

function sessionFixture(
	overrides: Partial<AuthenticatedAppSession["user"]> = {},
): AuthenticatedAppSession {
	const lists: ListService = {
		createList: jest.fn(),
		deleteList: jest.fn(),
		getList: jest.fn(),
		listLists: jest.fn(),
		renameList: jest.fn(),
	};
	const items: ItemService = {
		addItem: jest.fn(),
		listItems: jest.fn(),
		setItemChecked: jest.fn(),
	};
	const sync: AuthenticatedAppSessionSync = {
		getStatus: jest.fn(() => "synced"),
		requestSync: jest.fn(),
		subscribe: jest.fn(() => ({ remove() {} })),
	};
	const user = {
		id: "usr_1",
		email: "avery@example.com",
		displayName: "Avery User",
		firstName: null,
		lastName: null,
		onboardingCompletedAt: null,
		...overrides,
	};
	return {
		resourceKey: "session:usr_1",
		user,
		activeHousehold: {
			id: "hh_1",
			name: "Avery Household",
		},
		activeMember: {
			id: "mem_1",
			userId: "usr_1",
			role: "owner",
			displayName: user.displayName,
		},
		households: [],
		members: [],
		services: {
			lists,
			items,
			changes: {
				subscribe: () => ({ remove() {} }),
			},
			sync,
		},
	};
}

function setExpoConfig(config: {
	version: string;
	extra: Record<string, unknown>;
}) {
	(Constants as { expoConfig: unknown }).expoConfig = config;
}
