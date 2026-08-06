import { useAuth } from "@clerk/clerk-expo";
import { NavigationDrawerProvider } from "@mobile/app-shell/navigation-drawer-context";
import { useLogger } from "@mobile/lib/logger";
import type { AuthenticatedAppSession } from "@mobile/session";
import { useAuthenticatedAppSession } from "@mobile/session";
import { createMockLogger, type MockLogger } from "@mobile/test/mocks/logger";
import { drainToasts } from "@mobile/test/toast";
import { Toaster } from "@mobile/ui/toast";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen } from "@testing-library/react-native";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { WebBrowserResultType } from "expo-web-browser";
import type { PropsWithChildren, ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import SettingsScreen from "./settings-screen";

const mockRouterPush = jest.fn();
const mockGetToken = jest.fn(async () => "session-token");
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
	useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock("@clerk/clerk-expo", () => ({ useAuth: jest.fn() }));
jest.mock("@mobile/session", () => ({
	useAuthenticatedAppSession: jest.fn(),
}));
jest.mock("@mobile/lib/logger", () =>
	jest
		.requireActual<typeof import("@mobile/test/mocks/logger")>(
			"@mobile/test/mocks/logger",
		)
		.createMockLoggerModule(),
);

beforeEach(() => {
	mockLogger = createMockLogger();
	jest.mocked(useLogger).mockReturnValue(mockLogger);
	mockRouterPush.mockReset();
	jest.mocked(useAuth).mockReturnValue({
		getToken: mockGetToken,
	} as unknown as ReturnType<typeof useAuth>);
	jest.mocked(useAuthenticatedAppSession).mockReturnValue({
		state: { status: "ready", refreshing: false },
		session: authenticatedAppSessionFixture(),
		retry: jest.fn(),
		reloadSession: jest.fn(),
		signOut: jest.fn(),
	});
	jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
	jest.mocked(WebBrowser.openBrowserAsync).mockResolvedValue({
		type: WebBrowserResultType.OPENED,
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

afterEach(drainToasts);

describe("SettingsScreen", () => {
	it("renders the dedicated destination hub and configured legal rows", async () => {
		await renderWithSafeArea(<SettingsScreen />);

		expect(screen.getByText("Your App")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Profile" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Appearance" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Household" })).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Members & Invitations" }),
		).toBeTruthy();
		expect(screen.getByText("About")).toBeTruthy();
		expect(screen.getByText("Privacy Policy")).toBeTruthy();
		expect(screen.getByText("Terms of Service")).toBeTruthy();
		expect(screen.getByText("1.2.3 (local)")).toBeTruthy();
	});

	it("navigates to each dedicated app destination", async () => {
		await renderWithSafeArea(<SettingsScreen />);

		for (const [label, destination] of [
			["Profile", "/profile"],
			["Appearance", "/settings/appearance"],
			["Household", "/household/settings"],
			["Members & Invitations", "/household/members"],
			["Switch Household", "/household/switch"],
		] as const) {
			await fireEvent.press(screen.getByRole("button", { name: label }));
			expect(mockRouterPush).toHaveBeenLastCalledWith(destination);
		}
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

	it("reports a toast and logs when a legal URL cannot open", async () => {
		const error = new Error("browser unavailable");
		jest.mocked(WebBrowser.openBrowserAsync).mockRejectedValueOnce(error);
		await renderWithSafeArea(<SettingsScreen />);

		await fireEvent.press(screen.getByText("Privacy Policy"));

		expect(
			await screen.findByText("Unable to open link. Try again."),
		).toBeTruthy();
		expect(mockLogger.error).toHaveBeenCalledWith(
			"settings legal link failed",
			{ error },
		);
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
			<NavigationDrawerProvider open={jest.fn()}>
				{children}
			</NavigationDrawerProvider>
			<Toaster />
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
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
			firstName: "Avery",
			lastName: "Chen",
		},
		activeHousehold: { id: "hh_avery", name: "Avery Household" },
		households: [
			{
				id: "hh_avery",
				name: "Avery Household",
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
