import { isSensitiveKey } from "./sensitive-keys";

const BEARER_TOKEN_RE = /Bearer\s+[A-Za-z0-9_\-.=]+/g;
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const QUERY_PARAM_RE =
	/(^|[?&\s])((?:[A-Za-z0-9_.-]|%[A-Fa-f0-9]{2})+)=([^&#\s]*)/g;

export function redactString(value: string): string {
	return redactSensitiveQueryParams(value)
		.replace(BEARER_TOKEN_RE, "Bearer [REDACTED]")
		.replace(JWT_RE, "[REDACTED_JWT]")
		.replace(EMAIL_RE, "[REDACTED_EMAIL]");
}

export function isSensitiveAttributeKey(key: string): boolean {
	return isSensitiveKey(key);
}

export function redactAttributes(
	attributes: Record<string, unknown>,
): Record<string, unknown> {
	return redactRecord(attributes, new WeakSet<object>());
}

function redactRecord(
	attributes: Record<string, unknown>,
	seen: WeakSet<object>,
): Record<string, unknown> {
	seen.add(attributes);
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(attributes)) {
		if (isSensitiveAttributeKey(key)) {
			out[key] = "[REDACTED]";
			continue;
		}
		if (value instanceof Error) {
			appendErrorAttributes(out, value, seen);
			continue;
		}
		out[key] = redactValue(value, seen);
	}
	return out;
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
	if (value instanceof Error) {
		const out: Record<string, unknown> = {};
		appendErrorAttributes(out, value, seen);
		return out;
	}
	if (typeof value === "string") return redactString(value);
	if (Array.isArray(value)) {
		if (seen.has(value)) return "[Circular]";
		seen.add(value);
		return value.map((item) => redactValue(item, seen));
	}
	if (isPlainRecord(value)) {
		if (seen.has(value)) return "[Circular]";
		return redactRecord(value, seen);
	}
	return value;
}

function appendErrorAttributes(
	out: Record<string, unknown>,
	error: Error,
	seen: WeakSet<object>,
) {
	out.error_message = redactString(error.message);
	out.error_name = error.name;
	if (error.stack) out.error_stack = redactString(error.stack);
	const cause = (error as { cause?: unknown }).cause;
	if (cause !== undefined) {
		out.error_cause = redactValue(
			cause instanceof Error ? cause.message : String(cause),
			seen,
		);
	}
}

function redactSensitiveQueryParams(value: string): string {
	return value.replace(QUERY_PARAM_RE, (_match, prefix, key, rawValue) => {
		const decodedKey = safeDecodeURIComponent(key);
		return isSensitiveAttributeKey(decodedKey)
			? `${prefix}${key}=[REDACTED]`
			: `${prefix}${key}=${redactNestedQueryValue(rawValue)}`;
	});
}

function redactNestedQueryValue(value: string): string {
	const rawRedacted = redactSensitiveQueryParams(value);
	const decoded = safeDecodeURIComponent(rawRedacted);
	if (decoded === rawRedacted) return rawRedacted;

	const decodedRedacted = redactSensitiveQueryParams(decoded);
	return decodedRedacted === decoded
		? rawRedacted
		: encodeURIComponent(decodedRedacted);
}

function safeDecodeURIComponent(value: string): string {
	try {
		return decodeURIComponent(value.replace(/\+/g, " "));
	} catch {
		return value;
	}
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}
