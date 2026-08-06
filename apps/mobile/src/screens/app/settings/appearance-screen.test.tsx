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
import { UnistylesRuntime } from "react-native-unistyles";
import { NavigationDrawerProvider } from "@mobile/app-shell/navigation-drawer-context";
import { track } from "@mobile/lib/analytics";
import { useLogger } from "@mobile/lib/logger";
import type { AuthenticatedAppSession } from "@mobile/session";
import { useAuthenticatedAppSession } from "@mobile/session";
import { Toaster } from "@mobile/ui/toast";
import { createMockLogger, type MockLogger } from "@mobile/test/mocks/logger";
import { drainToasts } from "@mobile/test/toast";
import AppearanceScreen from "./appearance-screen";

const mockBack = jest.fn();
const mockCanGoBack = jest.fn();
const mockReplace = jest.fn();
const setAdaptiveThemesSpy = jest
	.spyOn(UnistylesRuntime, "setAdaptiveThemes")
	.mockImplementation(() => undefined);
const setThemeSpy = jest
	.spyOn(UnistylesRuntime, "setTheme")
	.mockImplementation(() => undefined);
let mockLogger: MockLogger;

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
	mockLogger = createMockLogger();
	jest.mocked(useLogger).mockReturnValue(mockLogger);
	mockBack.mockReset();
	mockCanGoBack.mockReset();
	mockCanGoBack.mockReturnValue(false);
	mockReplace.mockReset();
	setAdaptiveThemesSpy.mockClear();
	setThemeSpy.mockClear();
	jest.mocked(track).mockClear();
	jest.mocked(useAuth).mockReturnValue({
		getToken: jest.fn(async () => "session-token"),
	} as unknown as ReturnType<typeof useAuth>);
	jest.mocked(useAuthenticatedAppSession).mockReturnValue({
		state: { status: "ready", refreshing: false },
		session: authenticatedAppSessionFixture(),
		retry: jest.fn(),
		reloadSession: jest.fn(),
		signOut: jest.fn(),
	});
	jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
	jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
});

afterEach(drainToasts);

describe("AppearanceScreen", () => {
	it("renders the dedicated visual choices with System selected", async () => {
		await renderAppearance();

		expect(
			screen.getByRole("radio", { name: "System", selected: true }),
		).toBeTruthy();
		expect(screen.getByRole("radio", { name: "Light" })).toBeTruthy();
		expect(screen.getByRole("radio", { name: "Dark" })).toBeTruthy();
		expect(screen.getByText("Changes apply immediately.")).toBeTruthy();
	});

	it("persists and tracks dark appearance", async () => {
		await renderAppearance();
		await fireEvent.press(screen.getByRole("radio", { name: "Dark" }));

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

	it("applies the System appearance through adaptive themes", async () => {
		jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce("light");
		await renderAppearance();
		await screen.findByRole("radio", { name: "Light", selected: true });

		await fireEvent.press(screen.getByRole("radio", { name: "System" }));

		await waitFor(() =>
			expect(setAdaptiveThemesSpy).toHaveBeenCalledWith(true),
		);
	});

	it("reports a toast when appearance persistence fails", async () => {
		const error = new Error("storage unavailable");
		jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(error);
		await renderAppearance();

		await fireEvent.press(screen.getByRole("radio", { name: "Dark" }));

		expect(
			await screen.findByText("Unable to update appearance. Try again."),
		).toBeTruthy();
		expect(mockLogger.error).toHaveBeenCalledWith(
			"settings appearance preference write failed",
			{ error },
		);
	});

	it("returns to Settings when opened directly from the drawer", async () => {
		await renderAppearance();

		await fireEvent.press(screen.getByRole("button", { name: "Go back" }));

		expect(mockReplace).toHaveBeenCalledWith("/settings");
		expect(mockBack).not.toHaveBeenCalled();
	});
});

function renderAppearance() {
	return render(<AppearanceScreen />, { wrapper: TestProvider });
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
			<Toaster />
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
