import { useMemo } from "react";
import { useUser } from "@clerk/clerk-expo";

import { posthog } from "./posthog";

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

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "auth",
  "apikey",
  "api_key",
]);
const BEARER_TOKEN_RE = /Bearer\s+[A-Za-z0-9_\-.=]+/g;
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

function redactString(value: string): string {
  return value
    .replace(BEARER_TOKEN_RE, "Bearer [REDACTED]")
    .replace(JWT_RE, "[REDACTED_JWT]");
}

function normalizeAttributes(attributes: LogAttributes): LogAttributes {
  const out: LogAttributes = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = "[REDACTED]";
      continue;
    }
    if (value instanceof Error) {
      out.error_message = redactString(value.message);
      out.error_name = value.name;
      if (value.stack) out.error_stack = redactString(value.stack);
      const cause = (value as { cause?: unknown }).cause;
      if (cause !== undefined) {
        out.error_cause = cause instanceof Error ? cause.message : String(cause);
      }
      continue;
    }
    if (typeof value === "string") {
      out[key] = redactString(value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

class PostHogLoggerAdapter implements LoggerAdapter {
  log(level: LogLevel, message: string, attributes: LogAttributes) {
    posthog.logger[level](
      redactString(message),
      normalizeAttributes(attributes) as PostHogLogAttributes,
    );
  }
}

export const logger: Logger = new BaseLogger(new PostHogLoggerAdapter());

export function useLogger(): Logger {
  const { user } = useUser();
  const userId = user?.id;
  return useMemo(() => (userId ? logger.with({ user_id: userId }) : logger), [userId]);
}
