import { EXPO_PUSH_SEND_URL, PushSendError, sendPushNotifications } from ".";

describe("sendPushNotifications", () => {
	it("posts messages and returns DeviceNotRegistered tokens", async () => {
		const fetchFn = jest.fn(async () =>
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
});
