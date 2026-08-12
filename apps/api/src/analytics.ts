import type { ServerPostHogConfig } from "@api/config";
import type {
	AppEnv,
	EventMap,
	EventName,
	ServiceAnalytics,
} from "@dont-forget/shared";
import { asError, redactAttributes } from "@dont-forget/shared";
import { PostHog } from "posthog-node";

type ServerPostHogClient = Pick<PostHog, "capture" | "flush">;

type ServerAnalyticsConfig = {
	appEnv: AppEnv;
	posthog: ServerPostHogConfig;
	client?: ServerPostHogClient;
};

export type ServerAnalyticsRuntime = {
	analytics: ServiceAnalytics;
	flush: () => Promise<void>;
};

let installedAnalytics: ServiceAnalytics = {
	track() {
		warnMissingPostHogConfig();
	},
};
let warnedMissingConfig = false;
let warnedCaptureError = false;

export const serverServiceAnalytics: ServiceAnalytics = {
	track(event, properties) {
		installedAnalytics.track(event, properties);
	},
};

export function createServerAnalytics(
	config: ServerAnalyticsConfig,
): ServerAnalyticsRuntime {
	const client = config.client ?? posthogClient(config.posthog);
	const analytics: ServiceAnalytics = {
		track(event, properties) {
			if (!client) {
				warnMissingPostHogConfig();
				return;
			}

			try {
				client.capture({
					distinctId: distinctIdFromProperties(properties),
					event,
					properties: {
						...redactAttributes(properties),
						app_env: config.appEnv,
						runtime: "server",
					},
				});
			} catch (error) {
				warnCaptureError(error);
			}
		},
	};

	return {
		analytics,
		async flush() {
			await client?.flush();
		},
	};
}

export function installServerAnalytics(runtime: ServerAnalyticsRuntime): void {
	installedAnalytics = runtime.analytics;
}

function posthogClient(
	config: ServerPostHogConfig,
): ServerPostHogClient | null {
	if (config.kind === "disabled") return null;

	return new PostHog(config.projectToken, {
		host: config.host,
		flushAt: 1,
		flushInterval: 0,
	});
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
	const value = Reflect.get(properties, key);
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function warnMissingPostHogConfig(): void {
	if (warnedMissingConfig) return;
	warnedMissingConfig = true;
	console.warn(
		"PostHog project token not configured. Server analytics will be disabled. " +
			"Set POSTHOG_PROJECT_TOKEN in the selected environment to enable analytics.",
	);
}

function warnCaptureError(error: unknown): void {
	if (warnedCaptureError) return;
	warnedCaptureError = true;
	console.warn(
		"Server analytics capture failed",
		redactAttributes({ error: asError(error) }),
	);
}
