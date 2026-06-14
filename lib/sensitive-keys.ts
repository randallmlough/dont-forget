const SENSITIVE_KEYS = new Set([
	"password",
	"token",
	"secret",
	"authorization",
	"cookie",
	"cookies",
	"auth",
	"apikey",
	"email",
	"emailaddress",
	"code",
	"joincode",
	"householdjoincode",
]);

export function normalizeSensitiveKey(key: string): string {
	return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isTokenFamilyKey(key: string): boolean {
	return normalizeSensitiveKey(key).endsWith("token");
}

export function isSensitiveKey(key: string): boolean {
	const normalized = normalizeSensitiveKey(key);
	return SENSITIVE_KEYS.has(normalized) || isTokenFamilyKey(normalized);
}
