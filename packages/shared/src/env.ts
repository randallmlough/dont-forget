import { z } from "zod";

export const DEFAULT_API_PORT = 8080;
export const DEFAULT_WEB_PORT = 3000;

const APP_ENVS = ["local", "test", "staging", "production"] as const;
const appEnvSchema = z.enum(APP_ENVS);
const requiredEnvValueSchema = z
	.string()
	.refine((value) => value.trim().length > 0);
const iosWebBaseUrlSchema = requiredEnvValueSchema.pipe(z.url());
const portValueSchema = z
	.string()
	.regex(/^[1-9][0-9]*$/)
	.transform((value) => Number(value))
	.pipe(z.number().int().min(1).max(65_535));

export type AppEnv = (typeof APP_ENVS)[number];

export function appSchemeForEnv(baseScheme: string, appEnv: AppEnv): string {
	return appEnv === "production" ? baseScheme : `${baseScheme}-${appEnv}`;
}

type EnvSource = Record<string, string | undefined>;

export type PublicExpoConfig = {
	appEnv: AppEnv;
	apiBaseUrl?: string;
	clerkPublishableKey: string;
	posthogHost?: string;
	posthogProjectToken?: string;
	powersyncUrl?: string;
	privacyPolicyUrl?: string;
	termsUrl?: string;
};

export type ClerkServerConfig = {
	appEnv: AppEnv;
	secretKey: string;
};

export type PostgresConfig = {
	appEnv: AppEnv;
	databaseUrl: string;
};

export function requireEnv(
	key: string,
	source: EnvSource = process.env,
): string {
	const result = requiredEnvValueSchema.safeParse(source[key]);
	if (!result.success) {
		throw new Error(`Missing required env var: ${key}`);
	}
	return result.data;
}

export function optionalEnv(
	key: string,
	source: EnvSource = process.env,
): string | undefined {
	const value = source[key];
	return value && value.trim().length > 0 ? value : undefined;
}

export function readAppEnv(source: EnvSource = process.env): AppEnv {
	return parseAppEnv(requireEnv("APP_ENV", source));
}

export function readApiPort(source: EnvSource = process.env): number {
	return readPort("API_PORT", DEFAULT_API_PORT, source);
}

export function readWebPort(source: EnvSource = process.env): number {
	return readPort("WEB_PORT", DEFAULT_WEB_PORT, source);
}

function readPort(
	key: "API_PORT" | "WEB_PORT",
	defaultValue: number,
	source: EnvSource,
): number {
	const value = source[key];
	if (value === undefined) {
		return defaultValue;
	}

	const result = portValueSchema.safeParse(value);
	if (result.success) {
		return result.data;
	}

	throw new Error(`${key} must be an integer from 1 through 65535`);
}

export function parseAppEnv(value: string): AppEnv {
	const result = appEnvSchema.safeParse(value);
	if (result.success) {
		return result.data;
	}

	throw new Error(
		`Invalid APP_ENV "${value}". Expected one of: ${APP_ENVS.join(", ")}`,
	);
}

export function readPublicExpoConfig(
	source: EnvSource = process.env,
): PublicExpoConfig {
	const appEnv = readAppEnv(source);
	const clerkPublishableKey = requireEnv(
		"EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
		source,
	);
	validateClerkKeyForEnv(
		appEnv,
		"EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
		clerkPublishableKey,
	);

	const apiBaseUrl = optionalEnv("EXPO_PUBLIC_API_BASE_URL", source);
	const powersyncUrl = optionalEnv("EXPO_PUBLIC_POWERSYNC_URL", source);
	// local builds derive the API base URL from the Expo dev server at
	// runtime (see lib/client-api/api-base-url.ts); only deployed envs need
	// it configured. Tests inject their own API dependencies.
	if (appEnv !== "test" && appEnv !== "local") {
		if (!apiBaseUrl) {
			throw new Error(
				`Missing required env var for ${appEnv}: EXPO_PUBLIC_API_BASE_URL`,
			);
		}
		validateApiBaseUrlForEnv(appEnv, apiBaseUrl);
		if (!powersyncUrl) {
			throw new Error(
				`Missing required env var for ${appEnv}: EXPO_PUBLIC_POWERSYNC_URL`,
			);
		}
		validatePowerSyncUrlForEnv(appEnv, powersyncUrl);
	}

	return {
		appEnv,
		apiBaseUrl,
		clerkPublishableKey,
		posthogHost: optionalEnv("POSTHOG_HOST", source),
		posthogProjectToken: optionalEnv("POSTHOG_PROJECT_TOKEN", source),
		powersyncUrl,
		privacyPolicyUrl: optionalPublicHttpsUrl(
			"EXPO_PUBLIC_PRIVACY_POLICY_URL",
			source,
		),
		termsUrl: optionalPublicHttpsUrl("EXPO_PUBLIC_TERMS_URL", source),
	};
}

// EAS CLI evaluates app.config.ts once BEFORE it fetches env vars from the
// EAS environment (it needs the projectId to fetch them), so the public vars
// are legitimately absent during that bootstrap pass. Absence of the Clerk
// key is the signal; any partially-set env still fails loudly above.
export function readPublicExpoConfigIfPresent(
	source: EnvSource = process.env,
): PublicExpoConfig | undefined {
	if (!optionalEnv("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY", source)) {
		return undefined;
	}

	return readPublicExpoConfig(source);
}

export function readIosAssociatedDomains(
	appEnv: AppEnv,
	apiBaseUrl: string | undefined,
	source: EnvSource = process.env,
): string[] | undefined {
	if (appEnv === "local" || appEnv === "test") {
		return undefined;
	}

	const webBaseUrl = iosWebBaseUrlSchema.safeParse(source.PUBLIC_WEB_BASE_URL);
	if (!webBaseUrl.success) {
		throw new Error(
			`PUBLIC_WEB_BASE_URL must be a valid URL when APP_ENV=${appEnv}`,
		);
	}
	const parsedWebBaseUrl = new URL(webBaseUrl.data);
	if (parsedWebBaseUrl.protocol !== "https:") {
		throw new Error(
			`PUBLIC_WEB_BASE_URL must use https:// when APP_ENV=${appEnv}`,
		);
	}
	const authority =
		webBaseUrl.data.slice("https://".length).split(/[/?#]/)[0] ?? "";
	const hostAndPort = authority.slice(authority.lastIndexOf("@") + 1);
	const hasExplicitPort = hostAndPort.startsWith("[")
		? hostAndPort.includes("]:")
		: hostAndPort.includes(":");
	if (
		authority.includes("@") ||
		hasExplicitPort ||
		parsedWebBaseUrl.pathname !== "/" ||
		parsedWebBaseUrl.search !== "" ||
		parsedWebBaseUrl.hash !== ""
	) {
		throw new Error(
			`PUBLIC_WEB_BASE_URL must be an HTTPS origin without credentials, a port, path, query, or fragment when APP_ENV=${appEnv}`,
		);
	}
	if (apiBaseUrl && parsedWebBaseUrl.origin === new URL(apiBaseUrl).origin) {
		throw new Error(
			`PUBLIC_WEB_BASE_URL must differ from EXPO_PUBLIC_API_BASE_URL when APP_ENV=${appEnv}`,
		);
	}

	return [`applinks:${parsedWebBaseUrl.hostname}`];
}

export function readPostgresConfig(
	source: EnvSource = process.env,
): PostgresConfig {
	const appEnv = readAppEnv(source);
	return {
		appEnv,
		databaseUrl: requireEnv("DATABASE_URL", source),
	};
}

const LOCAL_DATABASE_HOSTS = new Set([
	"localhost",
	"127.0.0.1",
	"::1",
	"host.docker.internal",
]);

export function assertLocalDirectoryDatabaseUrl(config: PostgresConfig): void {
	if (config.appEnv !== "local") {
		return;
	}

	let parsed: URL;
	try {
		parsed = new URL(config.databaseUrl);
	} catch {
		throw new Error("DATABASE_URL must be a valid URL when APP_ENV=local.");
	}

	const host = parsed.hostname.replace(/^\[|\]$/g, "");
	if (!LOCAL_DATABASE_HOSTS.has(host)) {
		throw new Error(
			`Refusing to use non-local Postgres directory database ${host}. ` +
				"Local data scripts require a local DATABASE_URL (e.g. localhost).",
		);
	}
}

export function readClerkServerConfig(
	source: EnvSource = process.env,
): ClerkServerConfig {
	const appEnv = readAppEnv(source);
	const secretKey = requireEnv("CLERK_SECRET_KEY", source);
	validateClerkKeyForEnv(appEnv, "CLERK_SECRET_KEY", secretKey);

	return { appEnv, secretKey };
}

export function readAppEnvFromExpoExtra(
	extra: Record<string, unknown> | undefined,
): AppEnv {
	const value = extra?.appEnv;
	if (typeof value === "string") {
		return parseAppEnv(value);
	}

	return readAppEnv();
}

export function validateClerkKeyForEnv(
	appEnv: AppEnv,
	keyName: string,
	key: string,
): void {
	const isProduction = appEnv === "production";
	const expectedPrefix = keyName.includes("PUBLISHABLE")
		? isProduction
			? "pk_live_"
			: "pk_test_"
		: isProduction
			? "sk_live_"
			: "sk_test_";

	if (!key.startsWith(expectedPrefix)) {
		throw new Error(
			`${keyName} must start with ${expectedPrefix} when APP_ENV=${appEnv}`,
		);
	}
}

export function validateApiBaseUrlForEnv(
	appEnv: AppEnv,
	apiBaseUrl: string,
): void {
	let parsed: URL;
	try {
		parsed = new URL(apiBaseUrl);
	} catch {
		throw new Error(
			`EXPO_PUBLIC_API_BASE_URL must be a valid URL when APP_ENV=${appEnv}`,
		);
	}
	if (parsed.protocol !== "https:") {
		throw new Error(
			`EXPO_PUBLIC_API_BASE_URL must use https:// when APP_ENV=${appEnv}`,
		);
	}
}

function validatePowerSyncUrlForEnv(
	appEnv: AppEnv,
	powersyncUrl: string,
): void {
	let parsed: URL;
	try {
		parsed = new URL(powersyncUrl);
	} catch {
		throw new Error(
			`EXPO_PUBLIC_POWERSYNC_URL must be a valid URL when APP_ENV=${appEnv}`,
		);
	}
	if (parsed.protocol !== "https:") {
		throw new Error(
			`EXPO_PUBLIC_POWERSYNC_URL must use https:// when APP_ENV=${appEnv}`,
		);
	}
}

function optionalPublicHttpsUrl(
	key: string,
	source: EnvSource = process.env,
): string | undefined {
	const value = optionalEnv(key, source);
	if (!value) return undefined;

	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error(`${key} must be a valid URL`);
	}

	if (parsed.protocol !== "https:") {
		throw new Error(`${key} must use https://`);
	}

	return parsed.href;
}

export function assertProductionConfirmation(
	appEnv: AppEnv,
	source: EnvSource = process.env,
): void {
	if (appEnv !== "production") {
		return;
	}

	if (source.CONFIRM_APP_ENV !== "production") {
		throw new Error(
			"Refusing production operation without CONFIRM_APP_ENV=production. " +
				"Re-run with APP_ENV=production CONFIRM_APP_ENV=production if this is intentional.",
		);
	}
}

export function isPersistentAppEnv(appEnv: AppEnv): boolean {
	return appEnv === "staging" || appEnv === "production";
}
