import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { ConfigContext, ExpoConfig } from "expo/config";
import type { ConfigPlugin } from "expo/config-plugins";
import { withXcodeProject } from "expo/config-plugins";

import {
	type AppEnv,
	isPersistentAppEnv,
	readPublicExpoConfig,
} from "./lib/env.ts";
import { loadEnvFile } from "./lib/load-env.ts";

type SentryPluginOptions = {
	organization?: string;
	project?: string;
};

type ConfigEnvSource = Record<string, string | undefined>;
type ExpoPlugin = NonNullable<ExpoConfig["plugins"]>[number];
type LocalExpoPlugin = ExpoPlugin | ConfigPlugin;
type XcodeShellScriptBuildPhase = {
	name?: string;
	shellScript?: string;
};
type XcodeProjectWithShellScriptBuildPhases = {
	pbxShellScriptBuildPhaseObj?: () => Record<
		string,
		XcodeShellScriptBuildPhase | undefined
	>;
};

const SENTRY_DISABLE_AUTO_UPLOAD_EXPORT =
	"export SENTRY_DISABLE_AUTO_UPLOAD=true";
const SENTRY_IOS_SCRIPT_PATHS = [
	"scripts/sentry-xcode.sh",
	"scripts/sentry-xcode-debug-files.sh",
];

export default ({ config }: ConfigContext): ExpoConfig => {
	loadEnvFile();
	const publicConfig = readPublicExpoConfig();
	const baseBundleIdentifier =
		config.ios?.bundleIdentifier ?? "com.dont-forget.app";
	const baseScheme =
		typeof config.scheme === "string" ? config.scheme : "dontforget";

	return {
		...config,
		plugins: withLocalConfigPlugins(config.plugins, publicConfig.appEnv),
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
			sentryDsn: publicConfig.sentryDsn,
			// EXPO_PUBLIC_PRIVACY_POLICY_URL is parsed in lib/env.ts and exposed here.
			privacyPolicyUrl: publicConfig.privacyPolicyUrl,
			termsUrl: publicConfig.termsUrl,
		},
	};
};

function withLocalConfigPlugins(
	plugins: ExpoConfig["plugins"],
	appEnv: AppEnv,
): ExpoConfig["plugins"] {
	const resolvedPlugins: LocalExpoPlugin[] = [...(plugins ?? [])];
	const sentryPlugin = "@sentry/react-native/expo";
	const disableSentryAutoUpload = shouldDisableSentryAutoUpload(appEnv);

	if (
		!resolvedPlugins.some(
			(plugin) =>
				plugin === sentryPlugin ||
				(Array.isArray(plugin) && plugin[0] === sentryPlugin),
		)
	) {
		resolvedPlugins.push([sentryPlugin, sentryPluginOptionsForEnv(appEnv)]);
	}

	if (disableSentryAutoUpload) {
		resolvedPlugins.push(withSentryDisableAutoUploadBuildPhases);
	}

	if (process.env.EXPO_WITH_ROCKETSIM_CONNECT !== "1") {
		return expoPluginsForConfig(resolvedPlugins);
	}

	const rocketSimPlugin = "./plugins/withRocketSimConnect.js";
	if (!existsSync(resolve(process.cwd(), rocketSimPlugin))) {
		console.warn(
			`Skipping RocketSim config plugin because ${rocketSimPlugin} does not exist.`,
		);
		return expoPluginsForConfig(resolvedPlugins);
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

	return expoPluginsForConfig(resolvedPlugins);
}

function expoPluginsForConfig(
	plugins: LocalExpoPlugin[],
): ExpoConfig["plugins"] {
	// Dynamic app config accepts function config plugins, but ExpoConfig's type
	// only models serializable plugin entries.
	return plugins as ExpoConfig["plugins"];
}

export function sentryPluginOptionsForEnv(
	appEnv: AppEnv,
	source: ConfigEnvSource = process.env,
): SentryPluginOptions {
	const organization = optionalConfigEnv(source.SENTRY_ORG);
	const project = optionalConfigEnv(source.SENTRY_PROJECT);

	if (shouldDisableSentryAutoUpload(appEnv, source)) {
		source.SENTRY_DISABLE_AUTO_UPLOAD = "true";
	}

	return {
		organization,
		project,
	};
}

export function setSentryDisableAutoUploadForIosBuildPhases(
	project: XcodeProjectWithShellScriptBuildPhases,
): void {
	const buildPhases = project.pbxShellScriptBuildPhaseObj?.();
	if (!buildPhases) return;

	for (const buildPhase of Object.values(buildPhases)) {
		if (!buildPhase?.shellScript) continue;
		if (!isSentryIosShellScript(buildPhase.shellScript)) continue;

		buildPhase.shellScript = prependSentryDisableAutoUploadExport(
			buildPhase.shellScript,
		);
	}
}

const withSentryDisableAutoUploadBuildPhases: ConfigPlugin = (config) =>
	withXcodeProject(config, (projectConfig) => {
		setSentryDisableAutoUploadForIosBuildPhases(projectConfig.modResults);
		return projectConfig;
	});

function shouldDisableSentryAutoUpload(
	appEnv: AppEnv,
	source: ConfigEnvSource = process.env,
): boolean {
	return (
		!isPersistentAppEnv(appEnv) ||
		!optionalConfigEnv(source.SENTRY_ORG) ||
		!optionalConfigEnv(source.SENTRY_PROJECT) ||
		!optionalConfigEnv(source.SENTRY_AUTH_TOKEN)
	);
}

function isSentryIosShellScript(shellScript: string): boolean {
	return SENTRY_IOS_SCRIPT_PATHS.some((path) => shellScript.includes(path));
}

function prependSentryDisableAutoUploadExport(shellScript: string): string {
	if (shellScript.includes(SENTRY_DISABLE_AUTO_UPLOAD_EXPORT)) {
		return shellScript;
	}

	if (shellScript.startsWith('"')) {
		return `"${SENTRY_DISABLE_AUTO_UPLOAD_EXPORT}\\n${shellScript.slice(1)}`;
	}

	return `${SENTRY_DISABLE_AUTO_UPLOAD_EXPORT}\n${shellScript}`;
}

function optionalConfigEnv(value: string | undefined): string | undefined {
	return value && value.trim().length > 0 ? value : undefined;
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
