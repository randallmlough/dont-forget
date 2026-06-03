const SENSITIVE_KEYS = new Set([
	"password",
	"token",
	"secret",
	"authorization",
	"cookie",
	"auth",
	"apikey",
	"api_key",
	"code",
	"joincode",
	"householdjoincode",
]);
const BEARER_TOKEN_RE = /Bearer\s+[A-Za-z0-9_\-.=]+/g;
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function redactString(value: string): string {
	return value
		.replace(BEARER_TOKEN_RE, "Bearer [REDACTED]")
		.replace(JWT_RE, "[REDACTED_JWT]")
		.replace(EMAIL_RE, "[REDACTED_EMAIL]");
}

export function redactAttributes(
	attributes: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
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
				out.error_cause =
					cause instanceof Error
						? redactString(cause.message)
						: redactString(String(cause));
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
