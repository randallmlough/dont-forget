import { redactAttributes, redactString } from "./redact";

describe("redaction", () => {
	it("redacts bearer tokens and JWT-shaped strings", () => {
		expect(
			redactString("Authorization: Bearer secret-token eyJabc.def.ghi"),
		).toBe("Authorization: Bearer [REDACTED] [REDACTED_JWT]");
	});

	it("redacts sensitive attribute keys and normalizes Error instances", () => {
		const attributes = redactAttributes({
			token: "secret-token",
			code: "ABCDEFGH",
			email: "avery@example.com",
			householdJoinCode: "23456789",
			message: "failed with Bearer secret-token",
			error: new Error("request failed with eyJabc.def.ghi"),
		});

		expect(attributes).toMatchObject({
			token: "[REDACTED]",
			code: "[REDACTED]",
			email: "[REDACTED]",
			householdJoinCode: "[REDACTED]",
			message: "failed with Bearer [REDACTED]",
			error_message: "request failed with [REDACTED_JWT]",
			error_name: "Error",
		});
	});

	it("redacts nested sensitive values and bearer params inside next paths", () => {
		const attributes = redactAttributes({
			params: {
				next: "/invitations/accept?token=secret-token&tab=preview",
				code: "ABCDEFGH",
			},
			history: [
				{
					next: "/households/join?code=ABCDEFGH",
				},
			],
		});

		expect(attributes).toEqual({
			params: {
				next: "/invitations/accept?token=[REDACTED]&tab=preview",
				code: "[REDACTED]",
			},
			history: [
				{
					next: "/households/join?code=[REDACTED]",
				},
			],
		});
	});
});
