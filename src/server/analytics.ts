import { PostHog } from "posthog-node";

import type { EventMap, EventName } from "@/shared/analytics-events";
import { optionalEnv } from "@/shared/env";
import { asError } from "@/shared/errors";
import { redactAttributes } from "@/shared/redact";
import type { ServiceAnalytics } from "@/shared/service-analytics";

type ServerPostHogClient = Pick<PostHog, "capture" | "flush">;

type ServerAnalyticsConfig = {
	appEnv?: string;
	client?: ServerPostHogClient;
	host?: string;
	projectToken?: string;
};

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

let defaultClient: ServerPostHogClient | null | undefined;
let warnedMissingConfig = false;
let warnedCaptureError = false;

export const serverServiceAnalytics: ServiceAnalytics = createServerAnalytics();

export function createServerAnalytics(
	config: ServerAnalyticsConfig = {},
): ServiceAnalytics {
	const configuredClient = config.client;

	return {
		track(event, properties) {
			const client = configuredClient ?? defaultServerPostHogClient(config);
			if (!client) return;

			try {
				client.capture({
					distinctId: distinctIdFromProperties(properties),
					event,
					properties: {
						...redactAttributes(properties),
						app_env: config.appEnv ?? optionalEnv("APP_ENV"),
						runtime: "server",
					},
				});
			} catch (error) {
				warnCaptureError(error);
			}
		},
	};
}

export async function flushServerAnalytics(
	client: ServerPostHogClient | null | undefined = defaultClient,
): Promise<void> {
	await client?.flush().catch(warnCaptureError);
}

function defaultServerPostHogClient(
	config: ServerAnalyticsConfig,
): ServerPostHogClient | null {
	if (defaultClient !== undefined) return defaultClient;

	const projectToken =
		config.projectToken ?? optionalEnv("POSTHOG_PROJECT_TOKEN");
	if (!projectToken || projectToken === "phc_your_project_token_here") {
		warnMissingPostHogConfig();
		defaultClient = null;
		return defaultClient;
	}

	defaultClient = new PostHog(projectToken, {
		host: config.host ?? optionalEnv("POSTHOG_HOST") ?? DEFAULT_POSTHOG_HOST,
		flushAt: 1,
		flushInterval: 0,
	});
	return defaultClient;
}

function distinctIdFromProperties<K extends EventName>(
	properties: EventMap[K],
): string | undefined {
	return (
		stringProperty(properties, "user_id") ??
		stringProperty(properties, "creator_user_id") ??
		stringProperty(properties, "requested_by_user_id") ??
		stringProperty(properties, "revoked_by_user_id")
	);
}

function stringProperty(properties: object, key: string): string | undefined {
	const value = (properties as Record<string, unknown>)[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function warnMissingPostHogConfig() {
	if (warnedMissingConfig) return;
	warnedMissingConfig = true;
	console.warn(
		"PostHog project token not configured. Server analytics will be disabled. " +
			"Set POSTHOG_PROJECT_TOKEN in the selected environment to enable analytics.",
	);
}

function warnCaptureError(error: unknown) {
	if (warnedCaptureError) return;
	warnedCaptureError = true;
	console.warn(
		"Server analytics capture failed",
		redactAttributes({ error: asError(error) }),
	);
}
