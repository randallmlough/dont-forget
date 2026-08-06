import {
	appSchemeForEnv,
	assertLocalDirectoryDatabaseUrl,
	assertProductionConfirmation,
	DEFAULT_API_PORT,
	DEFAULT_WEB_PORT,
	parseAppEnv,
	readApiPort,
	readIosAssociatedDomains,
	readPublicExpoConfig,
	readWebPort,
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

	it.each([
		["local", "dontforget-local"],
		["test", "dontforget-test"],
		["staging", "dontforget-staging"],
		["production", "dontforget"],
	] as const)("derives the %s app scheme", (appEnv, expected) => {
		expect(appSchemeForEnv("dontforget", appEnv)).toBe(expected);
	});

	it("defaults the web port to 3000", () => {
		expect(DEFAULT_WEB_PORT).toBe(3000);
	});

	it("defaults the API port to 8080", () => {
		expect(DEFAULT_API_PORT).toBe(8080);
		expect(readApiPort({})).toBe(8080);
	});

	it("reads explicit API and web ports", () => {
		expect(readApiPort({ API_PORT: "18087" })).toBe(18087);
		expect(readWebPort({ WEB_PORT: "13087" })).toBe(13087);
	});

	it("defaults only the matching missing port key", () => {
		expect(readApiPort({ WEB_PORT: "13087" })).toBe(8080);
		expect(readWebPort({ API_PORT: "18087" })).toBe(3000);
	});

	it.each([
		["API_PORT", readApiPort],
		["WEB_PORT", readWebPort],
	] as const)("rejects invalid %s values", (key, reader) => {
		for (const value of ["", " ", "abc", "12.5", "0", "65536"]) {
			expect(() => reader({ [key]: value })).toThrow(key);
		}
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
				EXPO_PUBLIC_POWERSYNC_URL: "https://ps.example.com",
			}).apiBaseUrl,
		).toBe("https://api.example.com");
	});

	it("requires PowerSync URLs for deployed app builds", () => {
		expect(() =>
			readPublicExpoConfig({
				APP_ENV: "staging",
				EXPO_PUBLIC_API_BASE_URL: "https://api.example.com",
				EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
			}),
		).toThrow("EXPO_PUBLIC_POWERSYNC_URL");
	});

	it("rejects non-HTTPS PowerSync URLs for deployed app builds", () => {
		expect(() =>
			readPublicExpoConfig({
				APP_ENV: "staging",
				EXPO_PUBLIC_API_BASE_URL: "https://api.example.com",
				EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
				EXPO_PUBLIC_POWERSYNC_URL: "http://ps.example.com",
			}),
		).toThrow("must use https://");
	});

	it("accepts HTTPS PowerSync URLs for deployed app builds", () => {
		expect(
			readPublicExpoConfig({
				APP_ENV: "staging",
				EXPO_PUBLIC_API_BASE_URL: "https://api.example.com",
				EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
				EXPO_PUBLIC_POWERSYNC_URL: "https://ps.example.com",
			}).powersyncUrl,
		).toBe("https://ps.example.com");
	});

	it("omits iOS Associated Domains for local and test without reading web config", () => {
		const unreadableSource = new Proxy<Record<string, string | undefined>>(
			{},
			{
				get() {
					throw new Error("source must not be read");
				},
			},
		);

		for (const appEnv of ["local", "test"] as const) {
			expect(
				readIosAssociatedDomains(appEnv, undefined, unreadableSource),
			).toBeUndefined();
			expect(
				readIosAssociatedDomains(appEnv, undefined, {
					PUBLIC_WEB_BASE_URL: "http://localhost:3000",
				}),
			).toBeUndefined();
		}
	});

	it.each([
		{
			apiBaseUrl: "https://api-staging.example.invalid",
			appEnv: "staging",
			expected: ["applinks:web-staging.example.invalid"],
			webBaseUrl: "https://web-staging.example.invalid",
		},
		{
			apiBaseUrl: "https://api-staging.example.invalid",
			appEnv: "staging",
			expected: ["applinks:web-staging.example.invalid"],
			webBaseUrl: "https://web-staging.example.invalid/",
		},
		{
			apiBaseUrl: "https://api.example.invalid",
			appEnv: "production",
			expected: ["applinks:web.example.invalid"],
			webBaseUrl: "https://web.example.invalid",
		},
		{
			apiBaseUrl: "https://api.example.invalid",
			appEnv: "production",
			expected: ["applinks:xn--bcher-kva.example"],
			webBaseUrl: "https://xn--bcher-kva.example",
		},
	] as const)("derives one normalized iOS Associated Domain for $appEnv from $webBaseUrl", ({
		apiBaseUrl,
		appEnv,
		expected,
		webBaseUrl,
	}) => {
		expect(
			readIosAssociatedDomains(appEnv, apiBaseUrl, {
				PUBLIC_WEB_BASE_URL: webBaseUrl,
			}),
		).toEqual(expected);
	});

	it("rejects absent, malformed, and non-HTTPS deployed web origins", () => {
		for (const webBaseUrl of [
			undefined,
			"",
			" ",
			"not a url",
			"http://web.example.invalid",
		]) {
			expect(() =>
				readIosAssociatedDomains("staging", "https://api.example.invalid", {
					PUBLIC_WEB_BASE_URL: webBaseUrl,
				}),
			).toThrow("PUBLIC_WEB_BASE_URL");
		}
	});

	it("rejects deployed web URLs that are not origin-only", () => {
		for (const webBaseUrl of [
			"https://user@web.example.invalid",
			"https://user:password@web.example.invalid",
			"https://web.example.invalid:8443",
			"https://web.example.invalid:443",
			"https://web.example.invalid/path",
			"https://web.example.invalid?query=value",
			"https://web.example.invalid#fragment",
		]) {
			expect(() =>
				readIosAssociatedDomains("production", "https://api.example.invalid", {
					PUBLIC_WEB_BASE_URL: webBaseUrl,
				}),
			).toThrow("PUBLIC_WEB_BASE_URL");
		}
	});

	it("rejects non-canonical web origins normalized by the URL parser", () => {
		for (const webBaseUrl of [
			"https://web.example.invalid/.",
			"https://web.example.invalid/..",
			"https://web.example.invalid/%2e",
			"https://web.example.invalid/%2e/",
			"https://web.example.invalid/%2e%2e",
			"https:////web.example.invalid",
		]) {
			expect(() =>
				readIosAssociatedDomains("production", "https://api.example.invalid", {
					PUBLIC_WEB_BASE_URL: webBaseUrl,
				}),
			).toThrow("PUBLIC_WEB_BASE_URL");
		}
	});

	it("rejects web hosts unsuitable for public iOS Associated Domains", () => {
		for (const webBaseUrl of [
			"https://localhost",
			"https://127.0.0.1",
			"https://192.0.2.10",
			"https://[2001:db8::1]",
			"https://intranet",
		]) {
			expect(() =>
				readIosAssociatedDomains("production", "https://api.example.invalid", {
					PUBLIC_WEB_BASE_URL: webBaseUrl,
				}),
			).toThrow("PUBLIC_WEB_BASE_URL");
		}
	});

	it("rejects whitespace and malformed public DNS hostnames", () => {
		for (const webBaseUrl of [
			" https://web.example.invalid",
			"https://web.example.invalid ",
			"https://example.invalid.",
			"https://example..invalid",
			"https://.example.invalid",
			"https://under_score.example",
			"https://-leading.example",
			"https://trailing-.example",
		]) {
			expect(() =>
				readIosAssociatedDomains("production", "https://api.example.invalid", {
					PUBLIC_WEB_BASE_URL: webBaseUrl,
				}),
			).toThrow("PUBLIC_WEB_BASE_URL");
		}
	});

	it("rejects public DNS hostnames beyond label and total length limits", () => {
		const overlongLabelHostname = `${"a".repeat(64)}.example`;
		const overlongHostname = [
			"a".repeat(63),
			"b".repeat(63),
			"c".repeat(63),
			"d".repeat(62),
		].join(".");

		for (const hostname of [overlongLabelHostname, overlongHostname]) {
			expect(() =>
				readIosAssociatedDomains("production", "https://api.example.invalid", {
					PUBLIC_WEB_BASE_URL: `https://${hostname}`,
				}),
			).toThrow("PUBLIC_WEB_BASE_URL");
		}
	});

	it("accepts a public DNS hostname at the label and total length limits", () => {
		const hostname = [
			"a".repeat(63),
			"b".repeat(63),
			"c".repeat(63),
			"d".repeat(61),
		].join(".");

		expect(
			readIosAssociatedDomains("production", "https://api.example.invalid", {
				PUBLIC_WEB_BASE_URL: `https://${hostname}`,
			}),
		).toEqual([`applinks:${hostname}`]);
	});

	it("rejects a deployed web origin equal to the normalized API origin", () => {
		expect(() =>
			readIosAssociatedDomains("staging", "https://shared.example.invalid/", {
				PUBLIC_WEB_BASE_URL: "https://shared.example.invalid",
			}),
		).toThrow("PUBLIC_WEB_BASE_URL must differ from EXPO_PUBLIC_API_BASE_URL");
	});

	it("keeps the mobile web-origin input out of public Expo runtime config", () => {
		const config = readPublicExpoConfig({
			APP_ENV: "staging",
			EXPO_PUBLIC_API_BASE_URL: "https://api.example.invalid",
			EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
			EXPO_PUBLIC_POWERSYNC_URL: "https://sync.example.invalid",
			PUBLIC_WEB_BASE_URL: "https://web.example.invalid",
		});

		expect(config).not.toHaveProperty("webBaseUrl");
		expect(config).not.toHaveProperty("publicWebBaseUrl");
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
