import type { ConfigContext } from "expo/config";

import { loadEnvFile } from "@dont-forget/shared/node";
import appConfig from "./app.config";

jest.mock("@dont-forget/shared/node", () => ({
	loadEnvFile: jest.fn(),
}));

const mockedLoadEnvFile = jest.mocked(loadEnvFile);
const originalEnv = new Map<string, string | undefined>();
const mutatedEnvKeys = [
	"APP_ENV",
	"API_PORT",
	"EXPO_APP_NAME",
	"EXPO_SCHEME",
	"EXPO_PUBLIC_API_BASE_URL",
	"EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
	"EXPO_PUBLIC_POWERSYNC_URL",
	"EXPO_PUBLIC_PRIVACY_POLICY_URL",
	"EXPO_PUBLIC_TERMS_URL",
	"IOS_BUNDLE_IDENTIFIER",
	"POSTHOG_HOST",
	"POSTHOG_PROJECT_TOKEN",
] as const;

beforeAll(() => {
	for (const key of mutatedEnvKeys) {
		originalEnv.set(key, process.env[key]);
	}
});

beforeEach(() => {
	mockedLoadEnvFile.mockReset();
	mockedLoadEnvFile.mockReturnValue("local");
	for (const key of mutatedEnvKeys) {
		delete process.env[key];
	}
});

afterEach(() => {
	for (const key of mutatedEnvKeys) {
		const value = originalEnv.get(key);
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
});

function configContext(extra?: Record<string, unknown>): ConfigContext {
	return {
		config: {
			extra,
			name: "Don't Forget",
			slug: "dont-forget",
		},
		packageJsonPath: "/synthetic/package.json",
		projectRoot: "/synthetic",
		staticConfigPath: null,
	};
}

function extraFromConfig(
	extra?: Record<string, unknown>,
): Record<string, unknown> {
	const config = appConfig(configContext(extra));
	if (!config.extra) {
		throw new Error("Expected Expo config extra");
	}
	return config.extra;
}

describe("app config", () => {
	it("bakes the default API port into public extra", () => {
		expect(extraFromConfig().apiPort).toBe(8080);
	});

	it("bakes an explicit API port into public extra", () => {
		process.env.API_PORT = "18087";

		expect(extraFromConfig().apiPort).toBe(18087);
	});

	it("rejects invalid API port input", () => {
		process.env.API_PORT = "not-a-port";

		expect(() => extraFromConfig()).toThrow("API_PORT");
	});

	it("preserves incoming extra values", () => {
		expect(extraFromConfig({ existing: "value" })).toMatchObject({
			apiPort: 8080,
			appEnv: "local",
			existing: "value",
		});
	});
});
