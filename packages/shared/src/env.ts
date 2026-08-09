import { z } from "zod";

export const DEFAULT_API_PORT = 8080;
export const DEFAULT_WEB_PORT = 3000;
export const APPLE_APP_SITE_ASSOCIATION_PATH =
	"/.well-known/apple-app-site-association";
export const PUBLIC_INVITATION_ENTRY = {
	path: "/invitations/accept",
	queryKey: "token",
} as const;
export const PUBLIC_HOUSEHOLD_JOIN_CODE_ENTRY = {
	path: "/households/join",
	queryKey: "code",
} as const;
export const PUBLIC_ENTRY_PATHS = [
	PUBLIC_INVITATION_ENTRY.path,
	PUBLIC_HOUSEHOLD_JOIN_CODE_ENTRY.path,
] as const;

const APP_ENVS = ["local", "test", "staging", "production"] as const;
const APPLE_TEAM_ID = "D64V4GPNLJ";
const BASE_APP_SCHEME = "dontforget";
const BASE_IOS_BUNDLE_IDENTIFIER = "com.dont-forget.app";
const DNS_HOSTNAME_MAX_LENGTH = 253;
const DNS_LABEL_MAX_LENGTH = 63;
const appEnvSchema = z.enum(APP_ENVS);
const requiredEnvValueSchema = z
	.string()
	.refine((value) => value.trim().length > 0);
const publicWebBaseUrlSchema = requiredEnvValueSchema.pipe(z.url());
const portValueSchema = z
	.string()
	.regex(/^[1-9][0-9]*$/)
	.transform((value) => Number(value))
	.pipe(z.number().int().min(1).max(65_535));

export type AppEnv = (typeof APP_ENVS)[number];
export type PublicEntryPath = (typeof PUBLIC_ENTRY_PATHS)[number];

export type AppIdentity = {
	appleAppId: string;
	bundleIdentifier: string;
	scheme: string;
};

export function appIdentityForEnv(appEnv: AppEnv): AppIdentity {
	const suffix = appEnv === "production" ? "" : `.${appEnv}`;
	const schemeSuffix = appEnv === "production" ? "" : `-${appEnv}`;
	const bundleIdentifier = `${BASE_IOS_BUNDLE_IDENTIFIER}${suffix}`;
	return {
		appleAppId: `${APPLE_TEAM_ID}.${bundleIdentifier}`,
		bundleIdentifier,
		scheme: `${BASE_APP_SCHEME}${schemeSuffix}`,
	};
}

export function appleAppSiteAssociationForEnv(appEnv: AppEnv) {
	return {
		applinks: {
			apps: [],
			details: [
				{
					appID: appIdentityForEnv(appEnv).appleAppId,
					paths: [...PUBLIC_ENTRY_PATHS],
				},
			],
		},
	};
}

type PublicEntryDefinition =
	| typeof PUBLIC_INVITATION_ENTRY
	| typeof PUBLIC_HOUSEHOLD_JOIN_CODE_ENTRY;

export function buildPublicEntryUrl({
	entry,
	publicWebBaseUrl,
	value,
}: {
	entry: PublicEntryDefinition;
	publicWebBaseUrl: string;
	value: string;
}): string {
	return `${publicWebBaseUrl}${entry.path}?${entry.queryKey}=${encodeURIComponent(value)}`;
}

type EnvSource = Record<string, string | undefined>;

export type PublicExpoConfig = {
	appEnv: AppEnv;
	apiBaseUrl?: string;
	clerkPublishableKey: string;
	posthogHost?: string;
	posthogProjectToken?: string;
	powersyncUrl?: string;
	publicWebBaseUrl?: string;
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
	const publicWebBaseUrlInput = optionalEnv("PUBLIC_WEB_BASE_URL", source);
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
		if (!publicWebBaseUrlInput) {
			throw new Error(
				`Missing required env var for ${appEnv}: PUBLIC_WEB_BASE_URL`,
			);
		}
	}
	const publicWebBaseUrl = publicWebBaseUrlInput
		? parsePublicWebBaseUrl(publicWebBaseUrlInput, appEnv)
		: undefined;
	assertDistinctPublicServiceOrigins({
		apiBaseUrl,
		appEnv,
		powersyncUrl,
		publicWebBaseUrl,
	});

	return {
		appEnv,
		apiBaseUrl,
		clerkPublishableKey,
		posthogHost: optionalEnv("POSTHOG_HOST", source),
		posthogProjectToken: optionalEnv("POSTHOG_PROJECT_TOKEN", source),
		powersyncUrl,
		publicWebBaseUrl,
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

function isPublicDnsHostname(hostname: string): boolean {
	if (
		hostname.length > DNS_HOSTNAME_MAX_LENGTH ||
		/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
		hostname.startsWith("[")
	) {
		return false;
	}

	const labels = hostname.split(".");
	return (
		labels.length >= 2 &&
		labels.every(
			(label) =>
				label.length <= DNS_LABEL_MAX_LENGTH &&
				/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
		)
	);
}

export function parsePublicWebBaseUrl(value: unknown, appEnv: AppEnv): string {
	if (typeof value === "string" && value !== value.trim()) {
		throw new Error(
			`PUBLIC_WEB_BASE_URL must not have leading or trailing whitespace when APP_ENV=${appEnv}`,
		);
	}

	const webBaseUrl = publicWebBaseUrlSchema.safeParse(value);
	if (!webBaseUrl.success) {
		throw new Error(
			`PUBLIC_WEB_BASE_URL must be a valid URL when APP_ENV=${appEnv}`,
		);
	}

	const parsed = new URL(webBaseUrl.data);
	const isCanonicalOrigin =
		webBaseUrl.data === parsed.origin ||
		webBaseUrl.data === `${parsed.origin}/`;
	if (!isCanonicalOrigin) {
		throw new Error(
			`PUBLIC_WEB_BASE_URL must be a root origin without credentials, a path, query, or fragment when APP_ENV=${appEnv}`,
		);
	}

	const isPublicHttpsOrigin =
		parsed.protocol === "https:" &&
		parsed.port === "" &&
		isPublicDnsHostname(parsed.hostname);
	const isLocalLoopbackOrigin =
		appEnv === "local" &&
		parsed.protocol === "http:" &&
		parsed.hostname === "localhost";
	if (!isPublicHttpsOrigin && !isLocalLoopbackOrigin) {
		throw new Error(
			`PUBLIC_WEB_BASE_URL must use a public HTTPS origin${appEnv === "local" ? " or an HTTP localhost origin" : ""} when APP_ENV=${appEnv}`,
		);
	}

	return parsed.origin;
}

export function readIosAssociatedDomains(
	appEnv: AppEnv,
	publicWebBaseUrl: string | undefined,
): string[] | undefined {
	if (appEnv === "local" || appEnv === "test") {
		return undefined;
	}

	const parsedWebBaseUrl = new URL(
		parsePublicWebBaseUrl(publicWebBaseUrl, appEnv),
	);

	return [`applinks:${parsedWebBaseUrl.hostname}`];
}

export function assertDistinctPublicServiceOrigins({
	apiBaseUrl,
	appEnv,
	powersyncUrl,
	publicWebBaseUrl,
}: {
	apiBaseUrl: string | undefined;
	appEnv: AppEnv;
	powersyncUrl: string | undefined;
	publicWebBaseUrl: string | undefined;
}): void {
	const origins = new Map<string, string>();
	for (const [key, value] of [
		["EXPO_PUBLIC_API_BASE_URL", apiBaseUrl],
		["PUBLIC_WEB_BASE_URL", publicWebBaseUrl],
		["EXPO_PUBLIC_POWERSYNC_URL", powersyncUrl],
	] satisfies [string, string | undefined][]) {
		if (!value) continue;
		const origin = new URL(value).origin;
		const existingKey = origins.get(origin);
		if (existingKey) {
			throw new Error(
				`${key} must differ from ${existingKey} when APP_ENV=${appEnv}`,
			);
		}
		origins.set(origin, key);
	}
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
