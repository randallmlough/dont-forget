import type { ErrorEvent } from "@sentry/react-native";

describe("initSentry", () => {
	beforeEach(() => {
		jest.resetModules();
		jest.doMock("expo-constants", () => ({
			__esModule: true,
			default: {
				expoConfig: {
					extra: {
						appEnv: "production",
						sentryDsn: "https://public@example.ingest.sentry.io/1",
					},
				},
			},
		}));
	});

	it("redacts automatic Sentry event fields before sending", () => {
		const { initSentry } =
			jest.requireActual<typeof import("./sentry")>("./sentry");
		const sentry = jest.requireMock(
			"@sentry/react-native",
		) as typeof import("@sentry/react-native");
		initSentry();
		const initOptions = jest.mocked(sentry.init).mock.calls[0]?.[0];
		const beforeSend = initOptions?.beforeSend;

		const redacted = beforeSend?.(
			{
				type: "error",
				message: "failed for avery@example.com",
				logentry: {
					message: "request failed with token=secret-token",
				},
				exception: {
					values: [
						{
							value: "Fetch failed for avery@example.com",
							stacktrace: {
								frames: [
									{
										filename: "app://accept?token=secret-token",
										abs_path: "app://accept?code=123456",
										function: "load avery@example.com",
										module: "Bearer secret-token",
										context_line: "Authorization: Bearer secret-token",
										pre_context: ["email avery@example.com"],
										post_context: ["token=secret-token"],
										vars: {
											authorization: "Bearer secret-token",
											email: "avery@example.com",
										},
									},
								],
							},
						},
					],
				},
				request: {
					url: "https://example.com/accept?token=secret-token",
					query_string: "code=123456",
					headers: {
						authorization: "Bearer secret-token",
					},
					cookies: "session=secret-token",
					data: {
						email: "avery@example.com",
					},
				},
				user: {
					id: "usr_avery",
					email: "avery@example.com",
				},
				tags: {
					email: "avery@example.com",
					feature: "sentry",
				},
				contexts: {
					device: {
						name: "Avery's iPhone",
						token: "secret-token",
					},
				},
				extra: {
					access_token: "secret-token",
					email: "avery@example.com",
				},
				breadcrumbs: [
					{
						message: "opened /accept?token=secret-token",
						data: {
							email: "avery@example.com",
						},
					},
				],
			} as unknown as ErrorEvent,
			{},
		);

		expect(redacted).toMatchObject({
			message: "failed for [REDACTED_EMAIL]",
			logentry: {
				message: "request failed with token=[REDACTED]",
			},
			exception: {
				values: [
					{
						value: "Fetch failed for [REDACTED_EMAIL]",
						stacktrace: {
							frames: [
								{
									filename: "app://accept?token=[REDACTED]",
									abs_path: "app://accept?code=[REDACTED]",
									function: "load [REDACTED_EMAIL]",
									module: "Bearer [REDACTED]",
									context_line: "Authorization: Bearer [REDACTED]",
									pre_context: ["email [REDACTED_EMAIL]"],
									post_context: ["token=[REDACTED]"],
									vars: {
										authorization: "[REDACTED]",
										email: "[REDACTED]",
									},
								},
							],
						},
					},
				],
			},
			request: {
				url: "https://example.com/accept?token=[REDACTED]",
				query_string: "code=[REDACTED]",
				headers: {
					authorization: "[REDACTED]",
				},
				cookies: "[REDACTED]",
				data: {
					email: "[REDACTED]",
				},
			},
			user: {
				id: "usr_avery",
				email: "[REDACTED]",
			},
			tags: {
				email: "[REDACTED]",
				feature: "sentry",
			},
			contexts: {
				device: {
					name: "Avery's iPhone",
					token: "[REDACTED]",
				},
			},
			extra: {
				access_token: "[REDACTED]",
				email: "[REDACTED]",
			},
			breadcrumbs: [
				{
					message: "opened /accept?token=[REDACTED]",
					data: {
						email: "[REDACTED]",
					},
				},
			],
		});
	});
});
