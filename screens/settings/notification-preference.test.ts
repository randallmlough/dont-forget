import AsyncStorage from "@react-native-async-storage/async-storage";

import {
	disabledPreference,
	readNotificationPreference,
	writeNotificationPreference,
} from "./notification-preference";

describe("notification preference persistence", () => {
	it("stores notification preference per User", async () => {
		await writeNotificationPreference("usr_avery", {
			enabled: true,
			expoPushToken: "ExponentPushToken[one]",
		});
		await writeNotificationPreference("usr_blake", disabledPreference());

		expect(AsyncStorage.setItem).toHaveBeenCalledWith(
			"notification-preference:usr_avery",
			JSON.stringify({
				enabled: true,
				expoPushToken: "ExponentPushToken[one]",
			}),
		);
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(
			"notification-preference:usr_blake",
			JSON.stringify(disabledPreference()),
		);
	});

	it("does not read another User's stored notification preference", async () => {
		jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) => {
			if (key === "notification-preference:usr_avery") {
				return JSON.stringify({
					enabled: true,
					expoPushToken: "ExponentPushToken[one]",
				});
			}
			return null;
		});

		await expect(readNotificationPreference("usr_blake")).resolves.toEqual(
			disabledPreference(),
		);
	});
});
