import AsyncStorage from "@react-native-async-storage/async-storage";

export type NotificationPreference = {
	enabled: boolean;
	expoPushToken: string | null;
};

const NOTIFICATION_PREFERENCE_KEY = "notification-preference";

export async function readNotificationPreference(): Promise<NotificationPreference> {
	const value = await AsyncStorage.getItem(NOTIFICATION_PREFERENCE_KEY);
	if (!value) return disabledPreference();

	try {
		const parsed: unknown = JSON.parse(value);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"enabled" in parsed &&
			typeof parsed.enabled === "boolean"
		) {
			const token =
				"expoPushToken" in parsed && typeof parsed.expoPushToken === "string"
					? parsed.expoPushToken
					: null;
			return { enabled: parsed.enabled, expoPushToken: token };
		}
	} catch {
		return disabledPreference();
	}
	return disabledPreference();
}

export async function writeNotificationPreference(
	preference: NotificationPreference,
): Promise<void> {
	await AsyncStorage.setItem(
		NOTIFICATION_PREFERENCE_KEY,
		JSON.stringify(preference),
	);
}

export function disabledPreference(): NotificationPreference {
	return { enabled: false, expoPushToken: null };
}
