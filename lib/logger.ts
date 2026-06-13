import { useUser } from "@clerk/clerk-expo";
import { useMemo } from "react";

import { posthog } from "./posthog";
import { redactAttributes, redactString } from "./redact";
import { captureSentryLoggerError } from "./sentry";

type PostHogLogAttributes = Parameters<typeof posthog.logger.info>[1];

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogAttributes = Record<string, unknown>;

export interface Logger {
	debug(message: string, attributes?: LogAttributes): void;
	info(message: string, attributes?: LogAttributes): void;
	warn(message: string, attributes?: LogAttributes): void;
	error(message: string, attributes?: LogAttributes): void;
	with(boundAttributes: LogAttributes): Logger;
}

interface LoggerAdapter {
	log(level: LogLevel, message: string, attributes: LogAttributes): void;
}

class BaseLogger implements Logger {
	constructor(
		private readonly adapter: LoggerAdapter,
		private readonly boundAttributes: LogAttributes = {},
	) {}

	debug(message: string, attributes?: LogAttributes) {
		this.write("debug", message, attributes);
	}
	info(message: string, attributes?: LogAttributes) {
		this.write("info", message, attributes);
	}
	warn(message: string, attributes?: LogAttributes) {
		this.write("warn", message, attributes);
	}
	error(message: string, attributes?: LogAttributes) {
		this.write("error", message, attributes);
	}

	with(extra: LogAttributes): Logger {
		return new BaseLogger(this.adapter, { ...this.boundAttributes, ...extra });
	}

	private write(level: LogLevel, message: string, attributes?: LogAttributes) {
		const merged = { ...this.boundAttributes, ...attributes };
		if (__DEV__) {
			const consoleMethod = level === "debug" ? "debug" : level;
			if (Object.keys(merged).length) {
				console[consoleMethod](`[${level}]`, message, merged);
			} else {
				console[consoleMethod](`[${level}]`, message);
			}
		}
		this.adapter.log(level, message, merged);
	}
}

class PostHogLoggerAdapter implements LoggerAdapter {
	log(level: LogLevel, message: string, attributes: LogAttributes) {
		const redactedMessage = redactString(message);
		const redactedAttributes = redactAttributes(attributes);
		posthog.logger[level](
			redactedMessage,
			redactedAttributes as PostHogLogAttributes,
		);
		if (level === "error") {
			captureSentryLoggerError(
				redactedMessage,
				redactedAttributes,
				redactedErrorFromAttributes(redactedAttributes),
			);
		}
	}
}

function redactedErrorFromAttributes(
	attributes: LogAttributes,
): Error | undefined {
	const message = attributes.error_message;
	if (typeof message !== "string") return undefined;

	const error = new Error(message);
	const name = attributes.error_name;
	const stack = attributes.error_stack;
	if (typeof name === "string") error.name = name;
	if (typeof stack === "string") error.stack = stack;
	return error;
}

export const logger: Logger = new BaseLogger(new PostHogLoggerAdapter());

export function useLogger(): Logger {
	const { user } = useUser();
	const userId = user?.id;
	return useMemo(
		() => (userId ? logger.with({ user_id: userId }) : logger),
		[userId],
	);
}
