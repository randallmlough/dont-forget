import type { Breadcrumb, ErrorEvent } from "@sentry/react-native";
import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { readAppEnvFromExpoExtra } from "@/lib/env";
import { redactAttributes } from "@/lib/redact";

type SentryExtra = Record<string, unknown>;

const extra = Constants.expoConfig?.extra;
const appEnv = readAppEnvFromExpoExtra(extra);
const sentryDsn = readSentryDsnFromExpoExtra(extra);

export const sentryEnabled =
	Boolean(sentryDsn) && (appEnv === "staging" || appEnv === "production");

let initialized = false;

export function initSentry(): void {
	if (initialized || !sentryDsn) return;
	initialized = true;

	Sentry.init({
		dsn: sentryDsn,
		enabled: sentryEnabled,
		environment: appEnv,
		tracesSampleRate: 0,
		sendDefaultPii: false,
		beforeSend: redactSentryEvent,
	});
}

export function setSentryUser(userId: string): void {
	if (!sentryEnabled) return;
	Sentry.setUser({ id: userId });
}

export function clearSentryUser(): void {
	if (!sentryEnabled) return;
	Sentry.setUser(null);
}

export function captureSentryLoggerError(
	message: string,
	attributes: SentryExtra,
	error?: Error,
): void {
	if (!sentryEnabled) return;

	Sentry.addBreadcrumb({
		level: "error",
		message,
		data: attributes,
	});

	if (error) {
		Sentry.captureException(error, { extra: attributes });
		return;
	}

	Sentry.captureMessage(message, { level: "error", extra: attributes });
}

function readSentryDsnFromExpoExtra(
	expoExtra: Record<string, unknown> | undefined,
): string | undefined {
	const value = expoExtra?.sentryDsn;
	return typeof value === "string" && value.trim().length > 0
		? value
		: undefined;
}

function redactSentryEvent(event: ErrorEvent): ErrorEvent {
	return {
		...event,
		extra: isRecord(event.extra) ? redactAttributes(event.extra) : event.extra,
		breadcrumbs: event.breadcrumbs?.map(redactBreadcrumb),
	};
}

function redactBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
	return {
		...breadcrumb,
		data: isRecord(breadcrumb.data)
			? (redactAttributes(breadcrumb.data) as Record<string, string>)
			: breadcrumb.data,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
