import { redactAttributes, redactString } from "./redact";

describe("redaction", () => {
	it("redacts bearer tokens, JWT-shaped strings, and emails", () => {
		expect(
			redactString(
				"Authorization: Bearer secret-token eyJabc.def.ghi user@example.com",
			),
		).toBe("Authorization: Bearer [REDACTED] [REDACTED_JWT] [REDACTED_EMAIL]");
	});

	it("redacts sensitive attribute keys and normalizes Error instances", () => {
		const error = new Error("request failed for user@example.com");
		error.stack = "Error: request failed for user@example.com";
		(error as { cause?: unknown }).cause = new Error(
			"provider rejected user@example.com",
		);
		const attributes = redactAttributes({
			token: "secret-token",
			code: "ABCDEFGH",
			householdJoinCode: "23456789",
			message: "failed with Bearer secret-token",
			error,
		});

		expect(attributes).toMatchObject({
			token: "[REDACTED]",
			code: "[REDACTED]",
			householdJoinCode: "[REDACTED]",
			message: "failed with Bearer [REDACTED]",
			error_message: "request failed for [REDACTED_EMAIL]",
			error_name: "Error",
			error_stack: "Error: request failed for [REDACTED_EMAIL]",
			error_cause: "provider rejected [REDACTED_EMAIL]",
		});
	});
});
