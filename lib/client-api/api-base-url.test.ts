import Constants from "expo-constants";

import { readApiBaseUrl } from "@/lib/client-api/api-base-url";

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
