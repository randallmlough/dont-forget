import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { ConfigContext, ExpoConfig } from "expo/config";

import {
	type AppEnv,
	appSchemeForEnv,
	readPublicExpoConfigIfPresent,
} from "./src/shared/env.ts";
import { loadEnvFile } from "./src/shared/load-env.ts";

export default ({ config }: ConfigContext): ExpoConfig => {
	const appEnv = loadEnvFile();
	// undefined only during the EAS CLI bootstrap evaluation (see
	// readPublicExpoConfigIfPresent); identifiers derive from APP_ENV alone,
	// and the second, env-injected evaluation fills the extras.
	const publicConfig = readPublicExpoConfigIfPresent();
	const baseBundleIdentifier =
		config.ios?.bundleIdentifier ?? "com.dont-forget.app";
	const baseScheme =
		typeof config.scheme === "string" ? config.scheme : "dontforget";

	return {
		...config,
		plugins: withLocalConfigPlugins(config.plugins),
		name:
			process.env.EXPO_APP_NAME ??
			appNameForEnv(config.name ?? "Don't Forget", appEnv),
		slug: config.slug ?? "dont-forget",
		scheme: process.env.EXPO_SCHEME ?? appSchemeForEnv(baseScheme, appEnv),
		ios: {
			...config.ios,
			bundleIdentifier:
				process.env.IOS_BUNDLE_IDENTIFIER ??
				bundleIdentifierForEnv(baseBundleIdentifier, appEnv),
		},
		extra: {
			...config.extra,
			appEnv,
			...(publicConfig && {
				apiBaseUrl: publicConfig.apiBaseUrl,
				posthogProjectToken: publicConfig.posthogProjectToken,
				posthogHost: publicConfig.posthogHost,
				powersyncUrl: publicConfig.powersyncUrl,
				// EXPO_PUBLIC_PRIVACY_POLICY_URL is parsed in lib/env.ts and exposed here.
				privacyPolicyUrl: publicConfig.privacyPolicyUrl,
				termsUrl: publicConfig.termsUrl,
			}),
		},
	};
};

function withLocalConfigPlugins(
	plugins: ExpoConfig["plugins"],
): ExpoConfig["plugins"] {
	const resolvedPlugins = [...(plugins ?? [])];

	if (process.env.EXPO_WITH_ROCKETSIM_CONNECT !== "1") {
		return resolvedPlugins;
	}

	const rocketSimPlugin = "./tooling/expo-plugins/withRocketSimConnect.js";
	if (!existsSync(resolve(process.cwd(), rocketSimPlugin))) {
		console.warn(
			`Skipping RocketSim config plugin because ${rocketSimPlugin} does not exist.`,
		);
		return resolvedPlugins;
	}

	if (
		!resolvedPlugins.some(
			(plugin) =>
				plugin === rocketSimPlugin ||
				(Array.isArray(plugin) && plugin[0] === rocketSimPlugin),
		)
	) {
		resolvedPlugins.push(rocketSimPlugin);
	}

	return resolvedPlugins;
}

function appNameForEnv(baseName: string, appEnv: AppEnv): string {
	if (appEnv === "production") {
		return baseName;
	}

	return `${baseName} ${labelForEnv(appEnv)}`;
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
