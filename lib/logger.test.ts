const mockPosthogLogger = {
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
};
const mockCaptureSentryLoggerError = jest.fn();

jest.mock("./posthog", () => ({
	posthog: {
		logger: mockPosthogLogger,
	},
}));

jest.mock("./sentry", () => ({
	captureSentryLoggerError: mockCaptureSentryLoggerError,
}));

describe("logger", () => {
	let consoleWarnSpy: jest.SpyInstance;
	let consoleErrorSpy: jest.SpyInstance;

	beforeEach(() => {
		jest.clearAllMocks();
		consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		consoleWarnSpy.mockRestore();
		consoleErrorSpy.mockRestore();
	});

	it("does not forward non-error logs to Sentry", () => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- Load after Jest registers module mocks.
		const { logger } = require("./logger") as typeof import("./logger");

		logger.warn("sync slow", { household_id: "hh_1" });

		expect(mockPosthogLogger.warn).toHaveBeenCalledWith("sync slow", {
			household_id: "hh_1",
		});
		expect(mockCaptureSentryLoggerError).not.toHaveBeenCalled();
	});

	it("forwards redacted error logs to Sentry", () => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- Load after Jest registers module mocks.
		const { logger } = require("./logger") as typeof import("./logger");
		const error = new Error("failed for avery@example.com");
		error.name = "FetchError";
		error.stack =
			"FetchError: failed for avery@example.com\nAuthorization: Bearer secret";

		logger.error("request failed for avery@example.com", {
			error,
			access_token: "secret-token",
			household_id: "hh_1",
		});

		expect(mockCaptureSentryLoggerError).toHaveBeenCalledTimes(1);
		const [message, attributes, sentryError] = mockCaptureSentryLoggerError.mock
			.calls[0] as [string, Record<string, unknown>, Error];
		expect(message).toBe("request failed for [REDACTED_EMAIL]");
		expect(attributes).toMatchObject({
			access_token: "[REDACTED]",
			error_message: "failed for [REDACTED_EMAIL]",
			error_name: "FetchError",
			household_id: "hh_1",
		});
		expect(attributes.error_stack).toContain("[REDACTED_EMAIL]");
		expect(attributes.error_stack).toContain("Bearer [REDACTED]");
		expect(sentryError.name).toBe("FetchError");
		expect(sentryError.message).toBe("failed for [REDACTED_EMAIL]");
		expect(sentryError.stack).toContain("Bearer [REDACTED]");
	});

	it("captures error-level messages without Error attributes", () => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- Load after Jest registers module mocks.
		const { logger } = require("./logger") as typeof import("./logger");

		logger.error("sync failed", { household_id: "hh_1" });

		expect(mockCaptureSentryLoggerError).toHaveBeenCalledWith(
			"sync failed",
			{ household_id: "hh_1" },
			undefined,
		);
	});
});
