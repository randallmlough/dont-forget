const APP_ENVS = ["local", "test", "staging", "production"] as const;

export type AppEnv = (typeof APP_ENVS)[number];

type EnvSource = Record<string, string | undefined>;

export type PublicExpoConfig = {
  appEnv: AppEnv;
  apiBaseUrl?: string;
  clerkPublishableKey: string;
  posthogHost?: string;
  posthogProjectToken?: string;
};

export type TursoConfig = {
  appEnv: AppEnv;
  directoryAuthToken: string;
  directoryUrl: string;
  org: string;
};

export type TursoMigrationConfig = TursoConfig & {
  platformGroupToken: string;
};

export type TursoOperatorConfig = TursoMigrationConfig & {
  platformApiToken: string;
};

export function requireEnv(key: string, source: EnvSource = process.env): string {
  const value = source[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

export function optionalEnv(key: string, source: EnvSource = process.env): string | undefined {
  const value = source[key];
  return value && value.trim().length > 0 ? value : undefined;
}

export function readAppEnv(source: EnvSource = process.env): AppEnv {
  return parseAppEnv(requireEnv("APP_ENV", source));
}

export function parseAppEnv(value: string): AppEnv {
  if (isAppEnv(value)) {
    return value;
  }

  throw new Error(`Invalid APP_ENV "${value}". Expected one of: ${APP_ENVS.join(", ")}`);
}

export function readPublicExpoConfig(source: EnvSource = process.env): PublicExpoConfig {
  const appEnv = readAppEnv(source);
  const clerkPublishableKey = requireEnv("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY", source);
  validateClerkKeyForEnv(appEnv, "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY", clerkPublishableKey);

  const apiBaseUrl = optionalEnv("EXPO_PUBLIC_API_BASE_URL", source);
  if (isPersistentAppEnv(appEnv) && !apiBaseUrl) {
    throw new Error(`Missing required env var for ${appEnv}: EXPO_PUBLIC_API_BASE_URL`);
  }

  return {
    appEnv,
    apiBaseUrl,
    clerkPublishableKey,
    posthogHost: optionalEnv("POSTHOG_HOST", source),
    posthogProjectToken: optionalEnv("POSTHOG_PROJECT_TOKEN", source),
  };
}

export function readTursoConfig(source: EnvSource = process.env): TursoConfig {
  const appEnv = readAppEnv(source);
  return {
    appEnv,
    directoryAuthToken: requireEnv("TURSO_DIRECTORY_AUTH_TOKEN", source),
    directoryUrl: requireEnv("TURSO_DIRECTORY_URL", source),
    org: requireEnv("TURSO_ORG", source),
  };
}

export function readTursoMigrationConfig(source: EnvSource = process.env): TursoMigrationConfig {
  return {
    ...readTursoConfig(source),
    platformGroupToken: requireEnv("TURSO_PLATFORM_GROUP_TOKEN", source),
  };
}

export function readTursoOperatorConfig(source: EnvSource = process.env): TursoOperatorConfig {
  return {
    ...readTursoMigrationConfig(source),
    platformApiToken: requireEnv("TURSO_PLATFORM_API_TOKEN", source),
  };
}

export function readAppEnvFromExpoExtra(extra: Record<string, unknown> | undefined): AppEnv {
  const value = extra?.appEnv;
  if (typeof value === "string") {
    return parseAppEnv(value);
  }

  return readAppEnv();
}

export function validateClerkKeyForEnv(appEnv: AppEnv, keyName: string, key: string): void {
  const isProduction = appEnv === "production";
  const expectedPrefix = keyName.includes("PUBLISHABLE")
    ? isProduction
      ? "pk_live_"
      : "pk_test_"
    : isProduction
      ? "sk_live_"
      : "sk_test_";

  if (!key.startsWith(expectedPrefix)) {
    throw new Error(`${keyName} must start with ${expectedPrefix} when APP_ENV=${appEnv}`);
  }
}

export function assertProductionConfirmation(appEnv: AppEnv, source: EnvSource = process.env): void {
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

function isAppEnv(value: string): value is AppEnv {
  return APP_ENVS.includes(value as AppEnv);
}
