import { readApiBaseUrl } from "@mobile/lib/api-base-url";
import Constants from "expo-constants";

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

	it("derives the local API base URL from the dev server host and baked API port", () => {
		setExpoConfig({ extra: { appEnv: "local", apiPort: 18087 } });
		mockGetDevServer.mockReturnValue({
			url: "http://192.168.0.32:8090/",
			bundleLoadedFromServer: true,
		});

		expect(readApiBaseUrl()).toBe("http://192.168.0.32:18087");
	});

	it("replaces localhost dev-server ports with the baked API port", () => {
		setExpoConfig({ extra: { appEnv: "local", apiPort: 18088 } });
		mockGetDevServer.mockReturnValue({
			url: "http://localhost:8091/",
			bundleLoadedFromServer: true,
		});

		expect(readApiBaseUrl()).toBe("http://localhost:18088");
	});

	it("replaces IPv6 dev-server ports with the baked API port", () => {
		setExpoConfig({ extra: { appEnv: "local", apiPort: 18089 } });
		mockGetDevServer.mockReturnValue({
			url: "http://[::1]:8092/",
			bundleLoadedFromServer: true,
		});

		expect(readApiBaseUrl()).toBe("http://[::1]:18089");
	});

	it("documents the accepted tunnel limitation by preserving HTTPS host while using the standalone API port", () => {
		setExpoConfig({ extra: { appEnv: "local", apiPort: 18090 } });
		mockGetDevServer.mockReturnValue({
			url: "https://abc-xyz.exp.direct/",
			bundleLoadedFromServer: true,
		});

		expect(readApiBaseUrl()).toBe("https://abc-xyz.exp.direct:18090");
	});

	it("ignores a configured URL in local builds so the dev server host and API port stay the source", () => {
		setExpoConfig({
			extra: {
				apiBaseUrl: "http://localhost:8081",
				apiPort: 18091,
				appEnv: "local",
			},
		});
		mockGetDevServer.mockReturnValue({
			url: "http://localhost:8090/",
			bundleLoadedFromServer: true,
		});

		expect(readApiBaseUrl()).toBe("http://localhost:18091");
	});

	it.each([
		["missing", undefined],
		["string", "18087"],
		["fractional", 18087.5],
		["zero", 0],
		["too high", 65536],
	] as const)("throws when local extra.apiPort is %s", (_name, apiPort) => {
		setExpoConfig({ extra: { appEnv: "local", apiPort } });
		mockGetDevServer.mockReturnValue({
			url: "http://localhost:8090/",
			bundleLoadedFromServer: true,
		});

		expect(() => readApiBaseUrl()).toThrow(/API_PORT|Expo config/);
	});

	it("throws when a local bundle was not loaded from a dev server", () => {
		setExpoConfig({ extra: { appEnv: "local", apiPort: 18087 } });
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
