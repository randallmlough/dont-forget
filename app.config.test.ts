import type { ConfigContext, ExpoConfig } from "expo/config";

const originalEnv = process.env;

beforeEach(() => {
	jest.resetModules();
	process.env = {
		...originalEnv,
		APP_ENV: "local",
		EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_config",
	};
	delete process.env.EXPO_WITH_ROCKETSIM_CONNECT;
});

afterEach(() => {
	process.env = originalEnv;
});

describe("app config", () => {
	it("includes the Expo Notifications config plugin", () => {
		const configure =
			jest.requireActual<typeof import("./app.config")>("./app.config").default;

		const config: ExpoConfig = {
			name: "Don't Forget",
			slug: "dont-forget",
			plugins: ["expo-router"],
		};
		const context: ConfigContext = {
			config,
			projectRoot: process.cwd(),
			staticConfigPath: `${process.cwd()}/app.json`,
			packageJsonPath: `${process.cwd()}/package.json`,
		};
		const result = configure(context);

		expect(result.plugins).toEqual(
			expect.arrayContaining(["expo-router", "expo-notifications"]),
		);
	});
});
