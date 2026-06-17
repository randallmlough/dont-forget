describe("root layout Unistyles startup", () => {
	it("loads the Unistyles configuration when the root layout module starts", () => {
		jest.resetModules();
		let didLoadUnistylesConfiguration = false;

		jest.doMock("@/lib/unistyles/unistyles", () => {
			didLoadUnistylesConfiguration = true;
			return {};
		});
		mockRootLayoutDependencies();

		jest.isolateModules(() => {
			jest.requireActual("@/app/_layout");
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
	}));
	jest.doMock("@/components/auth/auth-gate", () => ({
		AuthGate: () => null,
	}));
	jest.doMock("@/components/auth/redirect-policy", () => ({
		AUTH_PATHS: new Set<string>(),
		PUBLIC_AUTH_PRESERVING_PATHS: new Set<string>(),
	}));
	jest.doMock("@/components/session", () => ({
		AuthenticatedAppSessionProvider: ({ children }: { children: unknown }) =>
			children,
	}));
	jest.doMock("@/lib/analytics", () => ({
		screen: jest.fn(),
	}));
	jest.doMock("@/lib/env", () => ({
		readAppEnvFromExpoExtra: jest.fn(() => "test"),
		validateClerkKeyForEnv: jest.fn(),
	}));
	jest.doMock("@/lib/posthog", () => ({
		posthog: {},
	}));
	jest.doMock("@/lib/token-cache", () => ({
		tokenCache: {},
	}));
	jest.doMock("@/lib/unistyles/navigation-theme", () => ({
		navigationThemeFor: jest.fn(() => ({ colors: {} })),
	}));
	jest.doMock("@/lib/logger", () => ({
		logger: { error: jest.fn() },
	}));
	jest.doMock("@/lib/unistyles/appearance-preference", () => ({
		loadAndApplyAppearancePreference: jest.fn(async () => undefined),
	}));
}
