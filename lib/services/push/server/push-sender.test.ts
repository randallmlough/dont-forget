import {
	EXPO_PUSH_RECEIPTS_URL,
	EXPO_PUSH_SEND_URL,
	PushSendError,
	sendPushNotifications,
} from ".";

describe("sendPushNotifications", () => {
	it("posts messages and returns DeviceNotRegistered tokens", async () => {
		const fetchFn = jest
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					data: [
						{ status: "ok", id: "ticket-one" },
						{
							status: "error",
							message: "The device is not registered",
							details: { error: "DeviceNotRegistered" },
						},
					],
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					data: {
						"ticket-one": { status: "ok" },
					},
				}),
			);

		await expect(
			sendPushNotifications(
				[
					{ to: "ExponentPushToken[one]", title: "One", body: "First" },
					{ to: "ExponentPushToken[two]", title: "Two", body: "Second" },
				],
				{ fetchFn },
			),
		).resolves.toEqual({ deadTokens: ["ExponentPushToken[two]"] });

		expect(fetchFn).toHaveBeenCalledWith(
			EXPO_PUSH_SEND_URL,
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify([
					{ to: "ExponentPushToken[one]", title: "One", body: "First" },
					{ to: "ExponentPushToken[two]", title: "Two", body: "Second" },
				]),
			}),
		);
	});

	it("throws a typed error for invalid Expo responses", async () => {
		const fetchFn = jest.fn(async () => Response.json({ data: [] }));

		await expect(
			sendPushNotifications(
				[{ to: "ExponentPushToken[one]", title: "One", body: "First" }],
				{ fetchFn },
			),
		).rejects.toBeInstanceOf(PushSendError);
	});

	it("throws a typed error for non-dead-token Expo ticket failures", async () => {
		const fetchFn = jest.fn(async () =>
			Response.json({
				data: [
					{
						status: "error",
						message: "Invalid credentials",
						details: { error: "InvalidCredentials" },
					},
				],
			}),
		);

		await expect(
			sendPushNotifications(
				[{ to: "ExponentPushToken[one]", title: "One", body: "First" }],
				{ fetchFn },
			),
		).rejects.toBeInstanceOf(PushSendError);
	});

	it("polls receipts and returns DeviceNotRegistered tokens from accepted tickets", async () => {
		const fetchFn = jest
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					data: [{ status: "ok", id: "ticket-one" }],
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					data: {
						"ticket-one": {
							status: "error",
							message: "The device is not registered",
							details: { error: "DeviceNotRegistered" },
						},
					},
				}),
			);

		await expect(
			sendPushNotifications(
				[{ to: "ExponentPushToken[one]", title: "One", body: "First" }],
				{ fetchFn },
			),
		).resolves.toEqual({ deadTokens: ["ExponentPushToken[one]"] });

		expect(fetchFn).toHaveBeenCalledWith(
			EXPO_PUSH_RECEIPTS_URL,
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ ids: ["ticket-one"] }),
			}),
		);
	});

	it("resolves accepted tickets when receipts are not ready before retry timeout", async () => {
		const sleep = jest.fn(async () => undefined);
		const fetchFn = jest
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					data: [{ status: "ok", id: "ticket-one" }],
				}),
			)
			.mockResolvedValueOnce(Response.json({ data: {} }))
			.mockResolvedValueOnce(Response.json({ data: {} }));

		await expect(
			sendPushNotifications(
				[{ to: "ExponentPushToken[one]", title: "One", body: "First" }],
				{ fetchFn, receiptRetryDelaysMs: [0], sleep },
			),
		).resolves.toEqual({ deadTokens: [] });

		expect(sleep).toHaveBeenCalledWith(0);
		expect(fetchFn).toHaveBeenCalledTimes(3);
	});

	it("retries missing receipts before finalizing accepted tickets", async () => {
		const sleep = jest.fn(async () => undefined);
		const fetchFn = jest
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					data: [{ status: "ok", id: "ticket-one" }],
				}),
			)
			.mockResolvedValueOnce(Response.json({ data: {} }))
			.mockResolvedValueOnce(
				Response.json({
					data: {
						"ticket-one": {
							status: "error",
							message: "The device is not registered",
							details: { error: "DeviceNotRegistered" },
						},
					},
				}),
			);

		await expect(
			sendPushNotifications(
				[{ to: "ExponentPushToken[one]", title: "One", body: "First" }],
				{ fetchFn, receiptRetryDelaysMs: [0], sleep },
			),
		).resolves.toEqual({ deadTokens: ["ExponentPushToken[one]"] });

		expect(sleep).toHaveBeenCalledWith(0);
		expect(fetchFn).toHaveBeenCalledTimes(3);
	});
});
