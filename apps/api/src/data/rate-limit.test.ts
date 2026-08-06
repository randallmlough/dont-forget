import {
	allowDataRequest,
	RATE_LIMIT_CAPACITY,
	RATE_LIMIT_WINDOW_MS,
	resetRateLimiterForTests,
} from "./rate-limit";

describe("allowDataRequest", () => {
	beforeEach(() => {
		resetRateLimiterForTests();
	});

	it("returns false after capacity is exhausted and allows again after a full window", () => {
		const now = 10_000;
		for (let i = 0; i < RATE_LIMIT_CAPACITY; i += 1) {
			expect(allowDataRequest("user_a", now)).toBe(true);
		}

		expect(allowDataRequest("user_a", now)).toBe(false);
		expect(allowDataRequest("user_a", now + RATE_LIMIT_WINDOW_MS)).toBe(true);
	});
});
