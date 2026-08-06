import { DEFAULT_API_PORT } from "@dont-forget/shared";
import { readApiServerConfig } from "./config";

const requiredKeys = [
	"APP_ENV",
	"DATABASE_URL",
	"CLERK_SECRET_KEY",
	"PUBLIC_WEB_BASE_URL",
	"RESEND_API_KEY",
	"RESEND_FROM_ADDRESS",
	"POSTHOG_PROJECT_TOKEN",
	"POSTHOG_HOST",
] as const;

function validSource(): Record<string, string | undefined> {
	return {
		APP_ENV: "test",
		DATABASE_URL: "postgresql://synthetic.invalid/dont_forget",
		CLERK_SECRET_KEY: "sk_test_synthetic",
		PUBLIC_WEB_BASE_URL: "https://app.invalid",
		RESEND_API_KEY: "re_synthetic",
		RESEND_FROM_ADDRESS: "sender@example.com",
		POSTHOG_PROJECT_TOKEN: "phc_synthetic",
		POSTHOG_HOST: "https://posthog.invalid",
	};
}

describe("readApiServerConfig", () => {
	it("maps and trims the required server values and defaults the API port", () => {
		const source = {
			...validSource(),
			APP_ENV: "  test  ",
			DATABASE_URL: "  postgresql://synthetic.invalid/dont_forget  ",
			UNKNOWN_SERVER_VALUE: "ignored",
		};

		expect(readApiServerConfig(source)).toEqual({
			appEnv: "test",
			databaseUrl: "postgresql://synthetic.invalid/dont_forget",
			clerkSecretKey: "sk_test_synthetic",
			publicWebBaseUrl: "https://app.invalid",
			resendApiKey: "re_synthetic",
			resendFromAddress: "sender@example.com",
			posthogProjectToken: "phc_synthetic",
			posthogHost: "https://posthog.invalid",
			apiPort: DEFAULT_API_PORT,
		});
	});

	it("parses an explicit valid API port", () => {
		expect(
			readApiServerConfig({ ...validSource(), API_PORT: "4321" }).apiPort,
		).toBe(4321);
	});

	it.each(requiredKeys)("rejects missing and blank %s", (key) => {
		const missing = validSource();
		delete missing[key];

		expect(() => readApiServerConfig(missing)).toThrow();
		expect(() =>
			readApiServerConfig({ ...validSource(), [key]: "" }),
		).toThrow();
		expect(() =>
			readApiServerConfig({ ...validSource(), [key]: "   " }),
		).toThrow();
	});

	it.each([
		"0",
		"65536",
		"1.5",
		"not-a-number",
		"",
		"   ",
	])("rejects invalid API port %p", (API_PORT) => {
		expect(() => readApiServerConfig({ ...validSource(), API_PORT })).toThrow();
	});

	it.each([
		{ appEnv: "local", validPrefix: "sk_test_", invalidPrefix: "sk_live_" },
		{ appEnv: "test", validPrefix: "sk_test_", invalidPrefix: "sk_live_" },
		{ appEnv: "staging", validPrefix: "sk_test_", invalidPrefix: "sk_live_" },
		{
			appEnv: "production",
			validPrefix: "sk_live_",
			invalidPrefix: "sk_test_",
		},
	])("preserves the Clerk key prefix rule for $appEnv", ({
		appEnv,
		validPrefix,
		invalidPrefix,
	}) => {
		expect(() =>
			readApiServerConfig({
				...validSource(),
				APP_ENV: appEnv,
				CLERK_SECRET_KEY: `${validPrefix}synthetic`,
			}),
		).not.toThrow();
		expect(() =>
			readApiServerConfig({
				...validSource(),
				APP_ENV: appEnv,
				CLERK_SECRET_KEY: `${invalidPrefix}synthetic`,
			}),
		).toThrow();
	});

	it.each([
		{ key: "PUBLIC_WEB_BASE_URL", value: "not-a-url" },
		{ key: "POSTHOG_HOST", value: "not-a-url" },
		{ key: "RESEND_FROM_ADDRESS", value: "not-an-email" },
	])("rejects malformed $key", ({ key, value }) => {
		expect(() =>
			readApiServerConfig({ ...validSource(), [key]: value }),
		).toThrow();
	});
});
