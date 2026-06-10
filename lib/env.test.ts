import {
	assertProductionConfirmation,
	parseAppEnv,
	readPublicExpoConfig,
	validateClerkKeyForEnv,
} from "./env";

describe("environment config", () => {
	it("parses supported APP_ENV values", () => {
		expect(parseAppEnv("local")).toBe("local");
		expect(parseAppEnv("test")).toBe("test");
		expect(parseAppEnv("staging")).toBe("staging");
		expect(parseAppEnv("production")).toBe("production");
	});

	it("rejects unsupported APP_ENV values", () => {
		expect(() => parseAppEnv("prod")).toThrow('Invalid APP_ENV "prod"');
	});

	it("requires Clerk development publishable keys outside production", () => {
		expect(() =>
			validateClerkKeyForEnv(
				"staging",
				"EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
				"pk_live_123",
			),
		).toThrow("pk_test_");
	});

	it("requires Clerk production publishable keys in production", () => {
		expect(() =>
			validateClerkKeyForEnv(
				"production",
				"EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
				"pk_test_123",
			),
		).toThrow("pk_live_");
	});

	it("requires API base URLs for deployed app builds", () => {
		expect(() =>
			readPublicExpoConfig({
				APP_ENV: "staging",
				EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
			}),
		).toThrow("EXPO_PUBLIC_API_BASE_URL");
	});

	it("allows local builds to omit the API base URL", () => {
		expect(
			readPublicExpoConfig({
				APP_ENV: "local",
				EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
			}).apiBaseUrl,
		).toBeUndefined();
	});

	it("allows tests to omit the API base URL", () => {
		expect(
			readPublicExpoConfig({
				APP_ENV: "test",
				EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
			}).apiBaseUrl,
		).toBeUndefined();
	});

	it("requires confirmation for production operations", () => {
		expect(() => assertProductionConfirmation("production", {})).toThrow(
			"CONFIRM_APP_ENV=production",
		);
		expect(() =>
			assertProductionConfirmation("production", {
				CONFIRM_APP_ENV: "production",
			}),
		).not.toThrow();
	});
});
