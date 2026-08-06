// In-process per-user token bucket for /api/data. Single-VPS deployment
// (ADR-0018) makes an in-process limiter correct for the MVP; a distributed
// limiter is deferred (see docs/tech-debt/powersync-deferred-hardening.md).
export const RATE_LIMIT_CAPACITY = 120; // requests
export const RATE_LIMIT_WINDOW_MS = 60_000; // per 60s

type Bucket = { tokens: number; updatedAt: number };
const buckets = new Map<string, Bucket>();

// Returns true if the request is allowed; false if the user is over budget.
export function allowDataRequest(userId: string, now: number): boolean {
	const refillPerMs = RATE_LIMIT_CAPACITY / RATE_LIMIT_WINDOW_MS;
	const bucket = buckets.get(userId) ?? {
		tokens: RATE_LIMIT_CAPACITY,
		updatedAt: now,
	};
	const elapsed = Math.max(0, now - bucket.updatedAt);
	const tokens = Math.min(
		RATE_LIMIT_CAPACITY,
		bucket.tokens + elapsed * refillPerMs,
	);
	if (tokens < 1) {
		buckets.set(userId, { tokens, updatedAt: now });
		return false;
	}
	buckets.set(userId, { tokens: tokens - 1, updatedAt: now });
	return true;
}

// Test-only: reset the shared map between cases.
export function resetRateLimiterForTests(): void {
	buckets.clear();
}
