import { loadEnvFile } from "@dont-forget/shared/node";
import type { ConfigContext, ExpoConfig } from "expo/config";
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
	"EXPO_PUBLIC_API_BASE_URL",
	"EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
	"EXPO_PUBLIC_POWERSYNC_URL",
	"EXPO_PUBLIC_PRIVACY_POLICY_URL",
	"EXPO_PUBLIC_TERMS_URL",
	"POSTHOG_HOST",
	"POSTHOG_PROJECT_TOKEN",
	"PUBLIC_WEB_BASE_URL",
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

type TestConfigInput = {
	extra?: Record<string, unknown>;
	ios?: ExpoConfig["ios"];
};

function configContext({ extra, ios }: TestConfigInput = {}): ConfigContext {
	return {
		config: {
			extra,
			ios,
			name: "Don't Forget",
			slug: "dont-forget",
		},
		packageJsonPath: "/synthetic/package.json",
		projectRoot: "/synthetic",
		staticConfigPath: null,
	};
}

function resolvedConfig(input?: TestConfigInput): ExpoConfig {
	return appConfig(configContext(input));
}

function extraFromConfig(
	extra?: Record<string, unknown>,
): Record<string, unknown> {
	const config = resolvedConfig({ extra });
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

	it.each([
		"local",
		"test",
	] as const)("clears incoming iOS Associated Domains for %s builds", (appEnv) => {
		mockedLoadEnvFile.mockReturnValue(appEnv);
		process.env.APP_ENV = appEnv;
		process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_synthetic";
		if (appEnv === "local") {
			process.env.PUBLIC_WEB_BASE_URL = "http://localhost:3000";
		}

		const config = resolvedConfig({
			ios: {
				associatedDomains: ["applinks:static.example.invalid"],
			},
		});

		expect(config.ios?.associatedDomains).toBeUndefined();
		expect(config.ios?.bundleIdentifier).toBe(`com.dont-forget.app.${appEnv}`);
		expect(config.scheme).toBe(`dontforget-${appEnv}`);
	});

	it("preserves the EAS bootstrap pass without a web origin", () => {
		mockedLoadEnvFile.mockReturnValue("staging");

		const config = resolvedConfig({
			ios: {
				associatedDomains: ["applinks:static.example.invalid"],
			},
		});

		expect(config.ios).toMatchObject({
			associatedDomains: undefined,
			bundleIdentifier: "com.dont-forget.app.staging",
		});
		expect(config.scheme).toBe("dontforget-staging");
	});

	it.each([
		{
			apiBaseUrl: "https://api-staging.example.invalid",
			appEnv: "staging",
			associatedDomains: ["applinks:web-staging.example.invalid"],
			bundleIdentifier: "com.dont-forget.app.staging",
			clerkPublishableKey: "pk_test_synthetic",
			powersyncUrl: "https://sync-staging.example.invalid",
			scheme: "dontforget-staging",
			webBaseUrl: "https://web-staging.example.invalid",
		},
		{
			apiBaseUrl: "https://api.example.invalid",
			appEnv: "production",
			associatedDomains: ["applinks:web.example.invalid"],
			bundleIdentifier: "com.dont-forget.app",
			clerkPublishableKey: "pk_live_synthetic",
			powersyncUrl: "https://sync.example.invalid",
			scheme: "dontforget",
			webBaseUrl: "https://web.example.invalid",
		},
	] as const)("resolves the $appEnv bundle identifier and iOS Associated Domain", ({
		apiBaseUrl,
		appEnv,
		associatedDomains,
		bundleIdentifier,
		clerkPublishableKey,
		powersyncUrl,
		scheme,
		webBaseUrl,
	}) => {
		mockedLoadEnvFile.mockReturnValue(appEnv);
		process.env.APP_ENV = appEnv;
		process.env.EXPO_PUBLIC_API_BASE_URL = apiBaseUrl;
		process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = clerkPublishableKey;
		process.env.EXPO_PUBLIC_POWERSYNC_URL = powersyncUrl;
		process.env.PUBLIC_WEB_BASE_URL = webBaseUrl;

		const config = resolvedConfig();

		expect(config.ios).toMatchObject({
			associatedDomains,
			bundleIdentifier,
		});
		expect(config.scheme).toBe(scheme);
		expect(
			Object.keys(config.extra ?? {}).filter((key) =>
				/web|associated.?domains?/i.test(key),
			),
		).toEqual([]);
	});

	it.each([
		{ label: "missing", webBaseUrl: undefined },
		{ label: "invalid", webBaseUrl: "http://web.example.invalid" },
		{
			label: "a normalized path",
			webBaseUrl: "https://web.example.invalid/.",
		},
		{ label: "a non-public host", webBaseUrl: "https://localhost" },
		{
			label: "the API origin",
			webBaseUrl: "https://api.example.invalid/",
		},
	])("rejects $label deployed web origin input", ({ webBaseUrl }) => {
		mockedLoadEnvFile.mockReturnValue("staging");
		process.env.APP_ENV = "staging";
		process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example.invalid";
		process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_synthetic";
		process.env.EXPO_PUBLIC_POWERSYNC_URL = "https://sync.example.invalid";
		if (webBaseUrl) {
			process.env.PUBLIC_WEB_BASE_URL = webBaseUrl;
		}

		expect(() => resolvedConfig()).toThrow("PUBLIC_WEB_BASE_URL");
	});
});
