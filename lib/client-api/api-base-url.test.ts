import Constants from "expo-constants";

import { readApiBaseUrl } from "@/lib/client-api/api-base-url";

jest.mock("expo-constants", () => ({
	__esModule: true,
	default: { expoConfig: null },
}));

function setExpoConfig(config: {
	hostUri?: string;
	extra?: Record<string, unknown>;
}) {
	(Constants as { expoConfig: unknown }).expoConfig = config;
}

describe("readApiBaseUrl", () => {
	it("derives the local API base URL from the dev server hostUri", () => {
		setExpoConfig({
			hostUri: "192.168.0.32:8090",
			extra: { appEnv: "local" },
		});

		expect(readApiBaseUrl()).toBe("http://192.168.0.32:8090");
	});

	it("ignores a configured URL in local builds so the dev server stays the single source", () => {
		setExpoConfig({
			hostUri: "localhost:8090",
			extra: { appEnv: "local", apiBaseUrl: "http://localhost:8081" },
		});

		expect(readApiBaseUrl()).toBe("http://localhost:8090");
	});

	it("throws when a local build has no dev server hostUri", () => {
		setExpoConfig({ extra: { appEnv: "local" } });

		expect(() => readApiBaseUrl()).toThrow("hostUri");
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
