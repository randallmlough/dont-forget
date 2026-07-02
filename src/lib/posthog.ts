import Constants from "expo-constants";
import PostHog from "posthog-react-native";

import { readAppEnvFromExpoExtra } from "./env";

const appEnv = readAppEnvFromExpoExtra(Constants.expoConfig?.extra);
const apiKey = Constants.expoConfig?.extra?.posthogProjectToken as
	| string
	| undefined;
const host = Constants.expoConfig?.extra?.posthogHost as string | undefined;
const appVersion = Constants.expoConfig?.version;
const isPostHogConfigured =
	!!apiKey && apiKey !== "phc_your_project_token_here";

if (!isPostHogConfigured) {
	console.warn(
		"PostHog project token not configured. Analytics will be disabled. " +
			"Set POSTHOG_PROJECT_TOKEN in the selected environment to enable analytics.",
	);
}

export const posthog = new PostHog(apiKey || "placeholder_key", {
	host,
	disabled: !isPostHogConfigured,
	captureAppLifecycleEvents: true,
	flushAt: 20,
	flushInterval: 10000,
	logs: {
		serviceName: "dont-forget",
		environment: appEnv,
		serviceVersion: appVersion,
	},
});
