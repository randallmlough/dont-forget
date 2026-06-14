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
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useAuthenticatedAppSession } from "@/components/session";
import { track } from "@/lib/analytics";
import { createUsersApiClient } from "@/lib/client-api/users";
import {
	registerForPushNotifications,
	unregisterPushNotifications,
} from "@/lib/push/registration";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { sessionBootstrapFixture } from "@/lib/services/session/bootstrap.test-helpers";
import SettingsScreen from "./settings-screen";

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockSignOut = jest.fn(async () => undefined);
const mockSendTestNotification = jest.fn(async () => ({
	sent: 1,
	disabled: 0,
}));

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
		registerPushToken: jest.fn(async () => undefined),
		unregisterPushToken: jest.fn(async () => undefined),
		sendTestNotification: mockSendTestNotification,
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
	mockSendTestNotification.mockClear();
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
		session: appSessionFixture(),
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

		expect(screen.getByText("Account")).toBeTruthy();
		expect(screen.getByText("Household settings")).toBeTruthy();
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

		expect(screen.getByText("Home")).toBeTruthy();

		await fireEvent.press(screen.getByRole("button", { name: "Back to Home" }));

		expect(mockRouterReplace).toHaveBeenCalledWith("/");
	});

	it("invokes authenticated app session sign-out", async () => {
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		expect(mockSignOut).toHaveBeenCalledTimes(1);
	});

	it("persists and tracks appearance changes", async () => {
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(screen.getByText("Dark"));

		expect(AsyncStorage.setItem).toHaveBeenCalledWith(
			"appearance-preference",
			"dark",
		);
		expect(track).toHaveBeenCalledWith("appearance_preference_changed", {
			preference: "dark",
		});
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
			"notification-preference:usr_avery",
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

	it("shows retry copy when push registration fails", async () => {
		jest
			.mocked(registerForPushNotifications)
			.mockRejectedValue(new Error("network timeout"));
		await renderWithSafeArea(<SettingsScreen />);

		await act(async () => {
			fireEvent(
				screen.getByRole("switch", { name: "Notifications" }),
				"valueChange",
				true,
			);
		});

		expect(
			await screen.findByText(
				"Notifications could not be enabled. Check your connection and try again.",
			),
		).toBeTruthy();
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(
			"notification-preference:usr_avery",
			JSON.stringify({ enabled: false, expoPushToken: null }),
		);
		expect(track).toHaveBeenCalledWith("push_registration_changed", {
			enabled: false,
			outcome: "failed",
		});
	});

	it("unregisters push notifications from the toggle", async () => {
		jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) => {
			if (key === "notification-preference:usr_avery") {
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

function setExpoConfig(config: {
	version: string;
	extra: Record<string, unknown>;
}) {
	(Constants as { expoConfig: unknown }).expoConfig = config;
}

function appSessionFixture(): AuthenticatedAppSession {
	return {
		...sessionBootstrapFixture(),
		resourceKey: "resource:usr_avery",
		services: {
			lists: {
				createList: async () => {
					throw new Error("unused");
				},
				getList: async () => {
					throw new Error("unused");
				},
				renameList: async () => {
					throw new Error("unused");
				},
				deleteList: async () => {
					throw new Error("unused");
				},
				listLists: async () => [],
			},
			items: {
				listItems: async () => [],
				addItem: async () => {
					throw new Error("unused");
				},
				setItemChecked: async () => undefined,
			},
			changes: {
				subscribe: () => ({ remove() {} }),
			},
			sync: {
				getStatus: () => "synced",
				subscribe: () => ({ remove() {} }),
				requestSync: async () => null,
			},
		},
	};
}
