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
			authToken: "auth-secret",
			access_token: "access-secret",
			refreshToken: "refresh-secret",
			id_token: "id-secret",
			code: "ABCDEFGH",
			email: "avery@example.com",
			householdJoinCode: "23456789",
			message: "failed with Bearer secret-token",
			error,
		});

		expect(attributes).toMatchObject({
			token: "[REDACTED]",
			authToken: "[REDACTED]",
			access_token: "[REDACTED]",
			refreshToken: "[REDACTED]",
			id_token: "[REDACTED]",
			code: "[REDACTED]",
			email: "[REDACTED]",
			householdJoinCode: "[REDACTED]",
			message: "failed with Bearer [REDACTED]",
			error_message: "request failed for [REDACTED_EMAIL]",
			error_name: "Error",
			error_stack: "Error: request failed for [REDACTED_EMAIL]",
			error_cause: "provider rejected [REDACTED_EMAIL]",
		});
	});

	it("redacts nested sensitive values and bearer params inside next paths", () => {
		const attributes = redactAttributes({
			params: {
				next: "/invitations/accept?token=secret-token&tab=preview",
				code: "ABCDEFGH",
				authToken: "auth-secret",
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
				authToken: "[REDACTED]",
			},
			history: [
				{
					next: "/households/join?code=[REDACTED]",
				},
			],
		});
	});

	it("redacts raw and encoded bearer params nested inside next query values", () => {
		expect(
			redactString(
				"/sign-in?next=/invitations/accept?token=secret-token&tab=preview",
			),
		).toBe("/sign-in?next=/invitations/accept?token=[REDACTED]&tab=preview");
		expect(
			redactString(
				"/sign-in?next=%2Finvitations%2Faccept%3Ftoken%3Dsecret-token%26tab%3Dpreview",
			),
		).toBe(
			"/sign-in?next=%2Finvitations%2Faccept%3Ftoken%3D%5BREDACTED%5D%26tab%3Dpreview",
		);
		expect(redactString("/callback?access_token=access-secret&state=ok")).toBe(
			"/callback?access_token=[REDACTED]&state=ok",
		);
		expect(
			redactString("/callback?access%5Ftoken=access-secret&state=ok"),
		).toBe("/callback?access%5Ftoken=[REDACTED]&state=ok");
	});

	it("redacts circular attribute graphs without throwing", () => {
		const attributes: Record<string, unknown> = { label: "safe" };
		const nested: Record<string, unknown> = { token: "nested-secret" };
		attributes.self = attributes;
		attributes.nested = nested;
		nested.parent = attributes;

		expect(redactAttributes(attributes)).toEqual({
			label: "safe",
			self: "[Circular]",
			nested: {
				token: "[REDACTED]",
				parent: "[Circular]",
			},
		});
	});
});
