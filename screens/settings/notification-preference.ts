import AsyncStorage from "@react-native-async-storage/async-storage";

export type NotificationPreference = {
	enabled: boolean;
	expoPushToken: string | null;
};

const NOTIFICATION_PREFERENCE_KEY_PREFIX = "notification-preference";

export async function readNotificationPreference(
	userId: string | null,
): Promise<NotificationPreference> {
	if (!userId) return disabledPreference();
	const value = await AsyncStorage.getItem(notificationPreferenceKey(userId));
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
	userId: string,
	preference: NotificationPreference,
): Promise<void> {
	await AsyncStorage.setItem(
		notificationPreferenceKey(userId),
		JSON.stringify(preference),
	);
}

export function disabledPreference(): NotificationPreference {
	return { enabled: false, expoPushToken: null };
}

function notificationPreferenceKey(userId: string): string {
	return `${NOTIFICATION_PREFERENCE_KEY_PREFIX}:${userId}`;
}
