import { z } from "zod";

const APP_ENVS = ["local", "test", "staging", "production"] as const;
const appEnvSchema = z.enum(APP_ENVS);
const requiredEnvValueSchema = z
	.string()
	.refine((value) => value.trim().length > 0);

export type AppEnv = (typeof APP_ENVS)[number];

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

export type TursoConfig = {
	appEnv: AppEnv;
	directoryAuthToken: string;
	directoryUrl: string;
	group: string;
	org: string;
};

export type TursoMigrationConfig = TursoConfig & {
	platformGroupToken: string;
};

export type TursoOperatorConfig = TursoMigrationConfig & {
	platformApiToken: string;
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

export function readTursoConfig(source: EnvSource = process.env): TursoConfig {
	const appEnv = readAppEnv(source);
	return {
		appEnv,
		directoryAuthToken: requireEnv("TURSO_DIRECTORY_AUTH_TOKEN", source),
		directoryUrl: requireEnv("TURSO_DIRECTORY_URL", source),
		group: requireEnv("TURSO_GROUP", source),
		org: requireEnv("TURSO_ORG", source),
	};
}

export function readTursoMigrationConfig(
	source: EnvSource = process.env,
): TursoMigrationConfig {
	return {
		...readTursoConfig(source),
		platformGroupToken: requireEnv("TURSO_PLATFORM_GROUP_TOKEN", source),
	};
}

export function readTursoOperatorConfig(
	source: EnvSource = process.env,
): TursoOperatorConfig {
	return {
		...readTursoMigrationConfig(source),
		platformApiToken: requireEnv("TURSO_PLATFORM_API_TOKEN", source),
	};
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
