import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";

const notificationPreferenceSchema = z.discriminatedUnion("enabled", [
	z.object({
		enabled: z.literal(false),
		expoPushToken: z.null(),
	}),
	z.object({
		enabled: z.literal(true),
		expoPushToken: z.string().min(1),
	}),
]);

export type NotificationPreference = z.infer<
	typeof notificationPreferenceSchema
>;

const NOTIFICATION_PREFERENCE_KEY_PREFIX = "notification-preference";

export async function readNotificationPreference(
	userId: string | null,
): Promise<NotificationPreference> {
	if (!userId) return disabledPreference();
	const value = await AsyncStorage.getItem(notificationPreferenceKey(userId));
	if (!value) return disabledPreference();

	try {
		const parsed: unknown = JSON.parse(value);
		const result = notificationPreferenceSchema.safeParse(parsed);
		if (result.success) return result.data;
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
