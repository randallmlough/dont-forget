import {
	assertLocalDirectoryDatabaseUrl,
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

	it("rejects non-HTTPS API base URLs for deployed app builds", () => {
		expect(() =>
			readPublicExpoConfig({
				APP_ENV: "staging",
				EXPO_PUBLIC_API_BASE_URL: "http://api.example.com",
				EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
			}),
		).toThrow("must use https://");
		expect(() =>
			readPublicExpoConfig({
				APP_ENV: "production",
				EXPO_PUBLIC_API_BASE_URL: "http://api.example.com",
				EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_123",
			}),
		).toThrow("must use https://");
	});

	it("rejects malformed API base URLs for deployed app builds", () => {
		expect(() =>
			readPublicExpoConfig({
				APP_ENV: "staging",
				EXPO_PUBLIC_API_BASE_URL: "not a url",
				EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
			}),
		).toThrow("must be a valid URL");
	});

	it("accepts HTTPS API base URLs for deployed app builds", () => {
		expect(
			readPublicExpoConfig({
				APP_ENV: "staging",
				EXPO_PUBLIC_API_BASE_URL: "https://api.example.com",
				EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
			}).apiBaseUrl,
		).toBe("https://api.example.com");
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

	it("reads optional public legal URLs", () => {
		expect(
			readPublicExpoConfig({
				APP_ENV: "test",
				EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
				EXPO_PUBLIC_PRIVACY_POLICY_URL: "https://example.com/privacy",
				EXPO_PUBLIC_TERMS_URL: "https://example.com/terms",
			}),
		).toMatchObject({
			privacyPolicyUrl: "https://example.com/privacy",
			termsUrl: "https://example.com/terms",
		});
	});

	it("ignores empty public legal URLs", () => {
		expect(
			readPublicExpoConfig({
				APP_ENV: "test",
				EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
				EXPO_PUBLIC_PRIVACY_POLICY_URL: " ",
				EXPO_PUBLIC_TERMS_URL: "",
			}),
		).toMatchObject({
			privacyPolicyUrl: undefined,
			termsUrl: undefined,
		});
	});

	it("rejects malformed public legal URLs", () => {
		expect(() =>
			readPublicExpoConfig({
				APP_ENV: "test",
				EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
				EXPO_PUBLIC_PRIVACY_POLICY_URL: "not a url",
			}),
		).toThrow("EXPO_PUBLIC_PRIVACY_POLICY_URL must be a valid URL");
	});

	it("rejects non-HTTPS public legal URLs", () => {
		expect(() =>
			readPublicExpoConfig({
				APP_ENV: "test",
				EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
				EXPO_PUBLIC_TERMS_URL: "http://example.com/terms",
			}),
		).toThrow("EXPO_PUBLIC_TERMS_URL must use https://");
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

	it("accepts loopback Postgres directory targets for local data scripts", () => {
		expect(() =>
			assertLocalDirectoryDatabaseUrl({
				appEnv: "local",
				databaseUrl: "postgresql://app:app@localhost:5432/dontforget",
			}),
		).not.toThrow();
		expect(() =>
			assertLocalDirectoryDatabaseUrl({
				appEnv: "local",
				databaseUrl: "postgresql://app:app@127.0.0.1:5432/dontforget",
			}),
		).not.toThrow();
	});

	it("rejects non-local Postgres directory targets for local data scripts", () => {
		expect(() =>
			assertLocalDirectoryDatabaseUrl({
				appEnv: "local",
				databaseUrl: "postgresql://app:app@db.example.com:5432/dontforget",
			}),
		).toThrow(/non-local Postgres directory database/);
	});

	it("rejects malformed DATABASE_URL for local data scripts", () => {
		expect(() =>
			assertLocalDirectoryDatabaseUrl({
				appEnv: "local",
				databaseUrl: "not a url",
			}),
		).toThrow(/must be a valid URL/);
	});

	it("does not constrain the Postgres target outside local", () => {
		expect(() =>
			assertLocalDirectoryDatabaseUrl({
				appEnv: "production",
				databaseUrl: "postgresql://app:app@db.example.com:5432/dontforget",
			}),
		).not.toThrow();
		expect(() =>
			assertLocalDirectoryDatabaseUrl({
				appEnv: "staging",
				databaseUrl: "postgresql://app:app@db.example.com:5432/dontforget",
			}),
		).not.toThrow();
	});
});
