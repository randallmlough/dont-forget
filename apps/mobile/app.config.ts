import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
	type AppEnv,
	appIdentityForEnv,
	readApiPort,
	readIosAssociatedDomains,
	readPublicExpoConfigIfPresent,
} from "@dont-forget/shared";
import { loadEnvFile } from "@dont-forget/shared/node";
import type { ConfigContext, ExpoConfig } from "expo/config";

const REPOSITORY_ROOT = resolve(__dirname, "../..");

export default ({ config }: ConfigContext): ExpoConfig => {
	const appEnv = loadEnvFile({ cwd: REPOSITORY_ROOT });
	const apiPort = readApiPort();
	// undefined only during the EAS CLI bootstrap evaluation (see
	// readPublicExpoConfigIfPresent); identifiers derive from APP_ENV alone,
	// and the second, env-injected evaluation fills the extras and entitlement.
	const publicConfig = readPublicExpoConfigIfPresent();
	const associatedDomains = publicConfig
		? readIosAssociatedDomains(appEnv, publicConfig.publicWebBaseUrl)
		: undefined;
	const identity = appIdentityForEnv(appEnv);

	return {
		...config,
		plugins: withLocalConfigPlugins(config.plugins),
		name:
			process.env.EXPO_APP_NAME ??
			appNameForEnv(config.name ?? "Don't Forget", appEnv),
		slug: config.slug ?? "dont-forget",
		scheme: identity.scheme,
		ios: {
			...config.ios,
			associatedDomains,
			bundleIdentifier: identity.bundleIdentifier,
		},
		extra: {
			...config.extra,
			appEnv,
			apiPort,
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

	const rocketSimPlugin = "../../tooling/expo-plugins/withRocketSimConnect.js";
	if (!existsSync(resolve(__dirname, rocketSimPlugin))) {
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
