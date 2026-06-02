const SENSITIVE_KEYS = new Set([
	"password",
	"token",
	"authtoken",
	"accesstoken",
	"refreshtoken",
	"idtoken",
	"sessiontoken",
	"bearertoken",
	"secret",
	"authorization",
	"cookie",
	"auth",
	"apikey",
	"api_key",
	"email",
	"emailaddress",
	"code",
	"joincode",
	"householdjoincode",
]);
const BEARER_TOKEN_RE = /Bearer\s+[A-Za-z0-9_\-.=]+/g;
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const QUERY_PARAM_RE = /([?&])([^=&#\s]+)=([^&#\s]*)/g;

export function redactString(value: string): string {
	return redactSensitiveQueryParams(value)
		.replace(BEARER_TOKEN_RE, "Bearer [REDACTED]")
		.replace(JWT_RE, "[REDACTED_JWT]");
}

export function isSensitiveAttributeKey(key: string): boolean {
	const normalized = normalizeAttributeKey(key);
	return SENSITIVE_KEYS.has(normalized) || normalized.endsWith("token");
}

export function redactAttributes(
	attributes: Record<string, unknown>,
): Record<string, unknown> {
	return redactRecord(attributes);
}

function redactRecord(
	attributes: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(attributes)) {
		if (isSensitiveAttributeKey(key)) {
			out[key] = "[REDACTED]";
			continue;
		}
		if (value instanceof Error) {
			appendErrorAttributes(out, value);
			continue;
		}
		out[key] = redactValue(value);
	}
	return out;
}

function redactValue(value: unknown): unknown {
	if (value instanceof Error) {
		const out: Record<string, unknown> = {};
		appendErrorAttributes(out, value);
		return out;
	}
	if (typeof value === "string") return redactString(value);
	if (Array.isArray(value)) return value.map(redactValue);
	if (isPlainRecord(value)) return redactRecord(value);
	return value;
}

function appendErrorAttributes(out: Record<string, unknown>, error: Error) {
	out.error_message = redactString(error.message);
	out.error_name = error.name;
	if (error.stack) out.error_stack = redactString(error.stack);
	const cause = (error as { cause?: unknown }).cause;
	if (cause !== undefined) {
		out.error_cause = redactValue(
			cause instanceof Error ? cause.message : String(cause),
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

function normalizeAttributeKey(key: string): string {
	return key.toLowerCase().replace(/[^a-z0-9]/g, "");
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
