import {
	registerForPushNotifications,
	unregisterPushNotifications,
} from "./registration";

jest.mock("expo-notifications", () => ({
	getExpoPushTokenAsync: jest.fn(),
	getPermissionsAsync: jest.fn(),
	requestPermissionsAsync: jest.fn(),
}));

const constants = {
	expoConfig: { extra: { eas: { projectId: "project-id" } } },
	easConfig: null,
};

describe("push registration", () => {
	it("returns unavailable when running without a physical device", async () => {
		await expect(
			registerForPushNotifications({
				constants,
				device: { isDevice: false, deviceName: null, modelName: "iPhone" },
				notifications: notificationMocks({ status: "granted" }),
				client: { registerPushToken: jest.fn() },
			}),
		).resolves.toEqual({ status: "unavailable" });
	});

	it("requests permissions and returns denied when final status is not granted", async () => {
		const notifications = notificationMocks({
			status: "undetermined",
			requestedStatus: "denied",
		});

		await expect(
			registerForPushNotifications({
				constants,
				device: { isDevice: true, deviceName: "iPhone", modelName: "iPhone" },
				notifications,
				client: { registerPushToken: jest.fn() },
			}),
		).resolves.toEqual({ status: "denied" });
		expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
	});

	it("fetches the Expo token with projectId and registers it with the API", async () => {
		const client = { registerPushToken: jest.fn(async () => undefined) };
		const notifications = notificationMocks({ status: "granted" });

		await expect(
			registerForPushNotifications({
				constants,
				device: {
					isDevice: true,
					deviceName: "Avery's iPhone",
					modelName: "iPhone",
				},
				notifications,
				client,
			}),
		).resolves.toEqual({
			status: "registered",
			expoPushToken: "ExponentPushToken[one]",
		});

		expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
			projectId: "project-id",
		});
		expect(client.registerPushToken).toHaveBeenCalledWith({
			expoPushToken: "ExponentPushToken[one]",
			deviceName: "Avery's iPhone",
		});
	});

	it("unregisters a stored token and ignores missing tokens", async () => {
		const client = { unregisterPushToken: jest.fn(async () => undefined) };

		await unregisterPushNotifications({
			client,
			expoPushToken: "ExponentPushToken[one]",
		});
		await unregisterPushNotifications({ client, expoPushToken: null });

		expect(client.unregisterPushToken).toHaveBeenCalledTimes(1);
		expect(client.unregisterPushToken).toHaveBeenCalledWith({
			expoPushToken: "ExponentPushToken[one]",
		});
	});
});

function notificationMocks({
	status,
	requestedStatus = status,
}: {
	status: "granted" | "denied" | "undetermined";
	requestedStatus?: "granted" | "denied" | "undetermined";
}) {
	return {
		getPermissionsAsync: jest.fn(async () => permissionResponse(status)),
		requestPermissionsAsync: jest.fn(async () =>
			permissionResponse(requestedStatus),
		),
		getExpoPushTokenAsync: jest.fn(async () => ({
			type: "expo" as const,
			data: "ExponentPushToken[one]",
		})),
	};
}

function permissionResponse(status: "granted" | "denied" | "undetermined") {
	return {
		status,
		granted: status === "granted",
		canAskAgain: status !== "denied",
		expires: "never" as const,
	};
}
