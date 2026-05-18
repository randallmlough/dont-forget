import type { ConfigContext, ExpoConfig } from "expo/config";

import { type AppEnv, readPublicExpoConfig } from "./lib/env.ts";
import { loadEnvFile } from "./lib/load-env.ts";

export default ({ config }: ConfigContext): ExpoConfig => {
	loadEnvFile();
	const publicConfig = readPublicExpoConfig();
	const baseBundleIdentifier =
		config.ios?.bundleIdentifier ?? "com.dont-forget.app";
	const baseScheme =
		typeof config.scheme === "string" ? config.scheme : "dontforget";

	return {
		...config,
		name:
			process.env.EXPO_APP_NAME ??
			appNameForEnv(config.name ?? "Don't Forget", publicConfig.appEnv),
		slug: config.slug ?? "dont-forget",
		scheme:
			process.env.EXPO_SCHEME ?? schemeForEnv(baseScheme, publicConfig.appEnv),
		ios: {
			...config.ios,
			bundleIdentifier:
				process.env.IOS_BUNDLE_IDENTIFIER ??
				bundleIdentifierForEnv(baseBundleIdentifier, publicConfig.appEnv),
		},
		extra: {
			...config.extra,
			appEnv: publicConfig.appEnv,
			apiBaseUrl: publicConfig.apiBaseUrl,
			posthogProjectToken: publicConfig.posthogProjectToken,
			posthogHost: publicConfig.posthogHost,
		},
	};
};

function appNameForEnv(baseName: string, appEnv: AppEnv): string {
	if (appEnv === "production") {
		return baseName;
	}

	return `${baseName} ${labelForEnv(appEnv)}`;
}

function schemeForEnv(baseScheme: string, appEnv: AppEnv): string {
	if (appEnv === "production") {
		return baseScheme;
	}

	return `${baseScheme}-${appEnv}`;
}

function bundleIdentifierForEnv(
	baseBundleIdentifier: string,
	appEnv: AppEnv,
): string {
	if (appEnv === "production") {
		return baseBundleIdentifier;
	}

	return `${baseBundleIdentifier}.${appEnv}`;
}

function labelForEnv(appEnv: AppEnv): string {
	switch (appEnv) {
		case "local":
			return "Local";
		case "test":
			return "Test";
		case "staging":
			return "Staging";
		case "production":
			return "Production";
	}
}
