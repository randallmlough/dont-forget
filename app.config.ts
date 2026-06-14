import { existsSync } from "node:fs";
import { resolve } from "node:path";

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
		plugins: withLocalConfigPlugins(config.plugins),
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
			// EXPO_PUBLIC_PRIVACY_POLICY_URL is parsed in lib/env.ts and exposed here.
			privacyPolicyUrl: publicConfig.privacyPolicyUrl,
			termsUrl: publicConfig.termsUrl,
		},
	};
};

function withLocalConfigPlugins(
	plugins: ExpoConfig["plugins"],
): ExpoConfig["plugins"] {
	const resolvedPlugins = [...(plugins ?? [])];
	addPluginOnce(resolvedPlugins, "expo-notifications");

	if (process.env.EXPO_WITH_ROCKETSIM_CONNECT !== "1") {
		return resolvedPlugins;
	}

	const rocketSimPlugin = "./plugins/withRocketSimConnect.js";
	if (!existsSync(resolve(process.cwd(), rocketSimPlugin))) {
		console.warn(
			`Skipping RocketSim config plugin because ${rocketSimPlugin} does not exist.`,
		);
		return resolvedPlugins;
	}

	addPluginOnce(resolvedPlugins, rocketSimPlugin);

	return resolvedPlugins;
}

function addPluginOnce(
	plugins: NonNullable<ExpoConfig["plugins"]>,
	pluginName: string,
): void {
	if (
		plugins.some(
			(plugin) =>
				plugin === pluginName ||
				(Array.isArray(plugin) && plugin[0] === pluginName),
		)
	) {
		return;
	}

	plugins.push(pluginName);
}

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
