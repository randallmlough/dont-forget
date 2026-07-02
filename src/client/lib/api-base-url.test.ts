import Constants from "expo-constants";

import { readApiBaseUrl } from "@/client/lib/api-base-url";

jest.mock("expo-constants", () => ({
	__esModule: true,
	default: { expoConfig: null },
}));

const mockGetDevServer = jest.fn();
jest.mock("react-native/Libraries/Core/Devtools/getDevServer", () => ({
	__esModule: true,
	default: () => mockGetDevServer(),
}));

function setExpoConfig(config: { extra?: Record<string, unknown> }) {
	(Constants as { expoConfig: unknown }).expoConfig = config;
}

describe("readApiBaseUrl", () => {
	beforeEach(() => {
		mockGetDevServer.mockReset();
	});

	it("derives the local API base URL from the dev server the bundle loaded from", () => {
		setExpoConfig({ extra: { appEnv: "local" } });
		mockGetDevServer.mockReturnValue({
			url: "http://192.168.0.32:8090/",
			bundleLoadedFromServer: true,
		});

		expect(readApiBaseUrl()).toBe("http://192.168.0.32:8090");
	});

	it("preserves the scheme of tunneled HTTPS dev-server origins", () => {
		setExpoConfig({ extra: { appEnv: "local" } });
		mockGetDevServer.mockReturnValue({
			url: "https://abc-xyz.exp.direct/",
			bundleLoadedFromServer: true,
		});

		expect(readApiBaseUrl()).toBe("https://abc-xyz.exp.direct");
	});

	it("ignores a configured URL in local builds so the dev server stays the single source", () => {
		setExpoConfig({
			extra: { appEnv: "local", apiBaseUrl: "http://localhost:8081" },
		});
		mockGetDevServer.mockReturnValue({
			url: "http://localhost:8090/",
			bundleLoadedFromServer: true,
		});

		expect(readApiBaseUrl()).toBe("http://localhost:8090");
	});

	it("throws when a local bundle was not loaded from a dev server", () => {
		setExpoConfig({ extra: { appEnv: "local" } });
		mockGetDevServer.mockReturnValue({
			url: "http://localhost:8081/",
			bundleLoadedFromServer: false,
		});

		expect(() => readApiBaseUrl()).toThrow("not loaded from one");
	});

	it("uses the configured URL when the mocked config has no appEnv, even if the shell exports APP_ENV=local", () => {
		// Component tests mock expo-constants with only an apiBaseUrl; the
		// test runner's inherited shell env must not flip them into the
		// dev-server branch.
		const previous = process.env.APP_ENV;
		process.env.APP_ENV = "local";
		try {
			setExpoConfig({ extra: { apiBaseUrl: "https://api.example" } });

			expect(readApiBaseUrl()).toBe("https://api.example");
			expect(mockGetDevServer).not.toHaveBeenCalled();
		} finally {
			process.env.APP_ENV = previous;
		}
	});

	it("reads the configured URL for deployed builds and strips a trailing slash", () => {
		setExpoConfig({
			extra: {
				appEnv: "staging",
				apiBaseUrl: "https://staging.dont-forget.app/",
			},
		});

		expect(readApiBaseUrl()).toBe("https://staging.dont-forget.app");
	});

	it("throws when a deployed build is missing the configured URL", () => {
		setExpoConfig({ extra: { appEnv: "staging" } });

		expect(() => readApiBaseUrl()).toThrow("EXPO_PUBLIC_API_BASE_URL");
	});
});
