import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { WebBrowserResultType } from "expo-web-browser";
import type { PropsWithChildren, ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useAuthenticatedAppSession } from "@/components/session";
import { track } from "@/lib/analytics";
import { useLogger } from "@/lib/logger";
import { createMockLogger, type MockLogger } from "@/lib/test/mocks/logger";
import SettingsScreen from "./settings-screen";

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockSignOut = jest.fn(async () => undefined);
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

jest.mock("@/components/session", () => ({
	useAuthenticatedAppSession: jest.fn(),
}));

jest.mock("@/lib/analytics", () =>
	jest.requireActual("@/lib/test/mocks/analytics"),
);

jest.mock("@/lib/logger", () =>
	jest
		.requireActual<typeof import("@/lib/test/mocks/logger")>(
			"@/lib/test/mocks/logger",
		)
		.createMockLoggerModule(),
);

beforeEach(() => {
	mockLogger = createMockLogger();
	jest.mocked(useLogger).mockReturnValue(mockLogger);
	mockRouterPush.mockReset();
	mockRouterReplace.mockReset();
	mockSignOut.mockClear();
	jest.mocked(track).mockClear();
	jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
	jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
	jest.mocked(WebBrowser.openBrowserAsync).mockResolvedValue({
		type: WebBrowserResultType.OPENED,
	});
	jest.mocked(useAuthenticatedAppSession).mockReturnValue({
		state: { status: "ready", refreshing: false },
		session: null,
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

		expect(screen.getByText("Household")).toBeTruthy();
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

		await fireEvent.press(screen.getByRole("button", { name: "Home" }));

		expect(mockRouterReplace).toHaveBeenCalledWith("/");
	});

	it("invokes authenticated app session sign-out", async () => {
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		expect(mockSignOut).toHaveBeenCalledTimes(1);
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

		expect(AsyncStorage.setItem).toHaveBeenCalledWith(
			"appearance-preference",
			"dark",
		);
		expect(track).toHaveBeenCalledWith("appearance_preference_changed", {
			preference: "dark",
		});
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
