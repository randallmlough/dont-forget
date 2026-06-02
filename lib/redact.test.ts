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
			authToken: "auth-secret",
			access_token: "access-secret",
			refreshToken: "refresh-secret",
			id_token: "id-secret",
			code: "ABCDEFGH",
			email: "avery@example.com",
			householdJoinCode: "23456789",
			message: "failed with Bearer secret-token",
			error: new Error("request failed with eyJabc.def.ghi"),
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
			error_message: "request failed with [REDACTED_JWT]",
			error_name: "Error",
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
	});
});
