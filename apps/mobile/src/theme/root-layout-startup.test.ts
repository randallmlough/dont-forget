describe("root layout Unistyles startup", () => {
	it("loads the Unistyles configuration when the root layout module starts", () => {
		jest.resetModules();
		let didLoadUnistylesConfiguration = false;

		jest.doMock("@mobile/theme/unistyles", () => {
			didLoadUnistylesConfiguration = true;
			return {};
		});
		mockRootLayoutDependencies();

		jest.isolateModules(() => {
			jest.requireActual("../../app/_layout");
		});

		expect(didLoadUnistylesConfiguration).toBe(true);
	});
});

function mockRootLayoutDependencies() {
	jest.doMock("@clerk/clerk-expo", () => ({
		ClerkProvider: ({ children }: { children: unknown }) => children,
	}));
	jest.doMock("expo-constants", () => ({
		__esModule: true,
		default: { expoConfig: { extra: { appEnv: "test" } } },
	}));
	jest.doMock("expo-router", () => ({
		useGlobalSearchParams: () => ({}),
		usePathname: () => "/",
	}));
	jest.doMock("expo-router/react-navigation", () => ({
		DefaultTheme: { colors: {} },
		ThemeProvider: ({ children }: { children: unknown }) => children,
	}));
	jest.doMock("expo-status-bar", () => ({
		StatusBar: () => null,
	}));
	jest.doMock("posthog-react-native", () => ({
		PostHogProvider: ({ children }: { children: unknown }) => children,
	}));
	jest.doMock("react-native-reanimated", () => ({}));
	jest.doMock("react-native-safe-area-context", () => ({
		initialWindowMetrics: null,
		SafeAreaProvider: ({ children }: { children: unknown }) => children,
	}));
	jest.doMock("react-native-unistyles", () => ({
		useUnistyles: jest.fn(),
		// The root layout pulls in the `Toaster`, whose stylesheet is built at
		// module load.
		StyleSheet: { create: jest.fn(() => ({})) },
	}));
	jest.doMock("@mobile/features/auth/auth-gate", () => ({
		AuthGate: () => null,
	}));
	jest.doMock("@mobile/features/auth/redirect-policy", () => ({
		AUTH_PATHS: new Set<string>(),
		PUBLIC_AUTH_PRESERVING_PATHS: new Set<string>(),
	}));
	jest.doMock("@mobile/session", () => ({
		AuthenticatedAppSessionProvider: ({ children }: { children: unknown }) =>
			children,
	}));
	jest.doMock("@mobile/lib/analytics", () => ({
		screen: jest.fn(),
	}));
	jest.doMock("@dont-forget/shared", () => ({
		readAppEnvFromExpoExtra: jest.fn(() => "test"),
		validateClerkKeyForEnv: jest.fn(),
	}));
	jest.doMock("@mobile/lib/posthog", () => ({
		posthog: {},
	}));
	jest.doMock("@mobile/lib/token-cache", () => ({
		tokenCache: {},
	}));
	jest.doMock("@mobile/theme/navigation-theme", () => ({
		navigationThemeFor: jest.fn(() => ({ colors: {} })),
	}));
	jest.doMock("@mobile/lib/logger", () => ({
		logger: { error: jest.fn() },
	}));
	jest.doMock("@mobile/theme/appearance-preference", () => ({
		loadAndApplyAppearancePreference: jest.fn(async () => undefined),
	}));
}
