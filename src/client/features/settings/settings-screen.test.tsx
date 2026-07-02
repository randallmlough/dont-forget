import { useAuth } from "@clerk/clerk-expo";
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
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { UnistylesRuntime } from "react-native-unistyles";
import { createUsersApiClient } from "@/client/features/settings/api";
import { track } from "@/client/lib/analytics";
import { useLogger } from "@/client/lib/logger";
import type { AuthenticatedAppSession } from "@/client/session";
import { useAuthenticatedAppSession } from "@/client/session";
import { createMockLogger, type MockLogger } from "@/test/mocks/logger";
import SettingsScreen from "./settings-screen";

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockGetToken = jest.fn(async () => "session-token");
const mockReloadSession = jest.fn();
const mockSignOut = jest.fn(async () => undefined);
const mockUpdateUserName = jest.fn(async () => ({
	id: "usr_avery",
	email: "avery@example.com",
	displayName: "Avery Lough",
	firstName: "Avery",
	lastName: "Lough",
}));
const devClientHeaderActionGutter = 56;
const setAdaptiveThemesSpy = jest
	.spyOn(UnistylesRuntime, "setAdaptiveThemes")
	.mockImplementation(() => undefined);
const setThemeSpy = jest
	.spyOn(UnistylesRuntime, "setTheme")
	.mockImplementation(() => undefined);
let mockLogger: MockLogger;

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
	useAuth: jest.fn(),
}));

jest.mock("@/client/session", () => ({
	useAuthenticatedAppSession: jest.fn(),
}));

jest.mock("@/client/features/settings/api", () => ({
	createUsersApiClient: jest.fn(),
}));

jest.mock("@/client/lib/analytics", () =>
	jest.requireActual("@/test/mocks/analytics"),
);

jest.mock("@/client/lib/logger", () =>
	jest
		.requireActual<typeof import("@/test/mocks/logger")>("@/test/mocks/logger")
		.createMockLoggerModule(),
);

beforeEach(() => {
	mockLogger = createMockLogger();
	jest.mocked(useLogger).mockReturnValue(mockLogger);
	mockRouterPush.mockReset();
	mockRouterReplace.mockReset();
	mockGetToken.mockClear();
	mockReloadSession.mockClear();
	mockSignOut.mockClear();
	mockUpdateUserName.mockClear();
	jest.mocked(useAuth).mockReturnValue({
		getToken: mockGetToken,
	} as unknown as ReturnType<typeof useAuth>);
	jest.mocked(createUsersApiClient).mockReturnValue({
		updateUserName: mockUpdateUserName,
	});
	setAdaptiveThemesSpy.mockClear();
	setThemeSpy.mockClear();
	jest.mocked(track).mockClear();
	jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
	jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
	jest.mocked(WebBrowser.openBrowserAsync).mockResolvedValue({
		type: WebBrowserResultType.OPENED,
	});
	jest.mocked(useAuthenticatedAppSession).mockReturnValue({
		state: { status: "ready", refreshing: false },
		session: authenticatedAppSessionFixture(),
		retry() {},
		reloadSession: mockReloadSession,
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
		expect(screen.getByText("User name")).toBeTruthy();
		expect(screen.getByText("Avery Chen")).toBeTruthy();
		expect(screen.getByText("Household settings")).toBeTruthy();
		expect(screen.getAllByText("Appearance").length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText("About")).toBeTruthy();
		expect(screen.getByText("Privacy Policy")).toBeTruthy();
		expect(screen.getByText("Terms of Service")).toBeTruthy();
		expect(screen.getByText("Version")).toBeTruthy();
		expect(screen.getByText("1.2.3 (local)")).toBeTruthy();
		expect(track).not.toHaveBeenCalledWith("settings_opened", {
			source: "home",
		});
	});

	it("hides legal rows when public URLs are unset", async () => {
		setExpoConfig({
			version: "1.2.3",
			extra: { appEnv: "production" },
		});

		await renderWithSafeArea(<SettingsScreen />);

		expect(screen.queryByText("Privacy Policy")).toBeNull();
		expect(screen.queryByText("Terms of Service")).toBeNull();
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

	it("shows a notice when a legal URL cannot open", async () => {
		const error = new Error("browser unavailable");
		jest.mocked(WebBrowser.openBrowserAsync).mockRejectedValueOnce(error);
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(screen.getByText("Privacy Policy"));

		expect(
			await screen.findByText("Unable to open link. Try again."),
		).toBeTruthy();
		expect(mockLogger.error).toHaveBeenCalledWith(
			"settings legal link failed",
			{
				error,
			},
		);
	});

	it("navigates to Household settings", async () => {
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(screen.getByText("Household settings"));

		expect(mockRouterPush).toHaveBeenCalledWith("/household/settings");
	});

	it("shows a visible Home action for returning to the Current List", async () => {
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

	it("updates the User name from Settings", async () => {
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(screen.getByRole("button", { name: "User name" }));
		await fireEvent.changeText(screen.getByLabelText("First name"), "Avery");
		await fireEvent.changeText(screen.getByLabelText("Last name"), "Lough");
		await fireEvent.press(screen.getByText("Save"));

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
		expect(await screen.findByText("User name updated.")).toBeTruthy();
	});

	it("preserves arrived session name parts when saving an expanded User name draft", async () => {
		jest.mocked(useAuthenticatedAppSession).mockReturnValue({
			state: { status: "ready", refreshing: false },
			session: null,
			retry() {},
			reloadSession: mockReloadSession,
			signOut: mockSignOut,
		});
		const { rerender } = await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(screen.getByRole("button", { name: "User name" }));
		await fireEvent.changeText(screen.getByLabelText("First name"), "Ava");

		jest.mocked(useAuthenticatedAppSession).mockReturnValue({
			state: { status: "ready", refreshing: false },
			session: authenticatedAppSessionFixture(),
			retry() {},
			reloadSession: mockReloadSession,
			signOut: mockSignOut,
		});
		await act(async () => {
			rerender(<SettingsScreen />);
		});

		expect(screen.getByLabelText("First name").props.value).toBe("Ava");
		await waitFor(() =>
			expect(screen.getByLabelText("Last name").props.value).toBe("Chen"),
		);
		await fireEvent.press(screen.getByText("Save"));

		await waitFor(() =>
			expect(mockUpdateUserName).toHaveBeenCalledWith({
				firstName: "Ava",
				lastName: "Chen",
			}),
		);
	});

	it("requires a first or last name before saving", async () => {
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(screen.getByRole("button", { name: "User name" }));
		await fireEvent.changeText(screen.getByLabelText("First name"), " ");
		await fireEvent.changeText(screen.getByLabelText("Last name"), " ");
		await fireEvent.press(screen.getByText("Save"));

		expect(mockUpdateUserName).not.toHaveBeenCalled();
		expect(screen.getByText("Provide a first or last name.")).toBeTruthy();
	});

	it("clears the Settings return target before signing out", async () => {
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		expect(mockRouterReplace).toHaveBeenCalledWith("/");
		expect(mockRouterReplace.mock.invocationCallOrder[0]).toBeLessThan(
			mockSignOut.mock.invocationCallOrder[0],
		);
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

	it("logs preference load failures and keeps the system default", async () => {
		const error = new Error("storage unavailable");
		jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(error);

		await renderWithSafeArea(<SettingsScreen />);

		await waitFor(() =>
			expect(mockLogger.error).toHaveBeenCalledWith(
				"settings appearance preference load failed",
				{ error },
			),
		);
		expect(screen.getAllByText("System").length).toBeGreaterThanOrEqual(1);
	});

	it("shows a notice when appearance preference persistence fails", async () => {
		const error = new Error("storage unavailable");
		jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(error);
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(screen.getByText("Dark"));

		expect(
			await screen.findByText("Unable to update appearance. Try again."),
		).toBeTruthy();
		expect(mockLogger.error).toHaveBeenCalledWith(
			"settings appearance preference write failed",
			{ error },
		);
		expect(track).not.toHaveBeenCalledWith("appearance_preference_changed", {
			preference: "dark",
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

function authenticatedAppSessionFixture(): AuthenticatedAppSession {
	const unusedServiceCall = async () => {
		throw new Error("Unexpected Settings session service call");
	};

	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
			firstName: "Avery",
			lastName: "Chen",
		},
		activeHousehold: { id: "hh_avery", name: "Avery" },
		households: [
			{ id: "hh_avery", name: "Avery", role: "owner", isActive: true },
		],
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner",
			displayName: "Avery Chen",
		},
		members: [
			{
				membershipId: "mbr_avery",
				userId: "usr_avery",
				role: "owner",
				displayName: "Avery Chen",
			},
		],
		resourceKey: "settings-test-session",
		services: {
			lists: {
				createList: unusedServiceCall,
				deleteList: unusedServiceCall,
				getList: unusedServiceCall,
				listLists: unusedServiceCall,
				renameList: unusedServiceCall,
			},
			items: {
				addItem: unusedServiceCall,
				listItems: unusedServiceCall,
				setItemChecked: unusedServiceCall,
			},
			changes: {
				subscribe: () => ({ remove() {} }),
			},
			sync: {
				getStatus: () => "synced",
				subscribe: () => ({ remove() {} }),
			},
		},
	};
}
