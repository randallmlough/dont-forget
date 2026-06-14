import { useAuth } from "@clerk/clerk-expo";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import { Linking } from "react-native";

import { useAuthenticatedAppSession } from "@/components/session";
import { track } from "@/lib/analytics";
import {
	createUsersApiClient,
	type UsersApiClient,
} from "@/lib/client-api/users";
import { type AppEnv, readAppEnvFromExpoExtra } from "@/lib/env";
import {
	registerForPushNotifications,
	unregisterPushNotifications,
} from "@/lib/push/registration";
import {
	type AppearancePreference,
	readAppearancePreference,
	writeAppearancePreference,
} from "./appearance-preference";
import {
	disabledPreference,
	type NotificationPreference,
	readNotificationPreference,
	writeNotificationPreference,
} from "./notification-preference";

export type SettingsState = {
	appearancePreference: AppearancePreference;
	appEnv: AppEnv;
	appVersion: string;
	notificationsEnabled: boolean;
	notificationNotice: string | null;
	privacyPolicyUrl: string | null;
	termsUrl: string | null;
};

export type SettingsActions = {
	openPrivacyPolicy: () => Promise<void>;
	sendTestNotification: () => Promise<void>;
	openTerms: () => Promise<void>;
	setAppearancePreference: (preference: AppearancePreference) => Promise<void>;
	setNotificationsEnabled: (enabled: boolean) => Promise<void>;
	signOut: () => Promise<void>;
};

export function useSettings(): {
	state: SettingsState;
	actions: SettingsActions;
} {
	const { getToken } = useAuth();
	const { session, signOut } = useAuthenticatedAppSession();
	const userId = session?.user.id ?? null;
	const extra = Constants.expoConfig?.extra;
	const [appearancePreference, setAppearancePreferenceState] =
		useState<AppearancePreference>("system");
	const [notificationPreference, setNotificationPreferenceState] =
		useState<NotificationPreference>(disabledPreference);
	const [notificationNotice, setNotificationNotice] = useState<string | null>(
		null,
	);
	const getTokenRef = useRef(getToken);
	useEffect(() => {
		getTokenRef.current = getToken;
	}, [getToken]);
	const usersClientRef = useRef<UsersApiClient | null>(null);
	usersClientRef.current ??= createUsersApiClient({
		getToken: () => getTokenRef.current(),
	});
	const privacyPolicyUrl = publicExtraString(extra, "privacyPolicyUrl");
	const termsUrl = publicExtraString(extra, "termsUrl");

	useEffect(() => {
		track("settings_opened", { source: "home" });
		let active = true;
		void Promise.all([
			readAppearancePreference(),
			readNotificationPreference(userId),
		]).then(([appearance, notifications]) => {
			if (!active) return;
			setAppearancePreferenceState(appearance);
			setNotificationPreferenceState(notifications);
		});
		return () => {
			active = false;
		};
	}, [userId]);

	async function setAppearancePreference(preference: AppearancePreference) {
		await writeAppearancePreference(preference);
		setAppearancePreferenceState(preference);
		// Only the light Unistyles theme exists today. When a dark theme lands,
		// apply this with UnistylesRuntime.setAdaptiveThemes(true) or setTheme(...).
		track("appearance_preference_changed", { preference });
	}

	async function setNotificationsEnabled(enabled: boolean) {
		setNotificationNotice(null);
		const client = usersClientRef.current;
		if (!client) return;
		if (!userId) {
			setNotificationNotice("Sign in again to update notification settings.");
			return;
		}

		if (!enabled) {
			await unregisterPushNotifications({
				client,
				expoPushToken: notificationPreference.expoPushToken,
			});
			const preference = disabledPreference();
			await writeNotificationPreference(userId, preference);
			setNotificationPreferenceState(preference);
			track("push_registration_changed", {
				enabled: false,
				outcome: "unregistered",
			});
			return;
		}

		let result: Awaited<ReturnType<typeof registerForPushNotifications>>;
		try {
			result = await registerForPushNotifications({ client });
		} catch {
			const preference = disabledPreference();
			await writeNotificationPreference(userId, preference);
			setNotificationPreferenceState(preference);
			setNotificationNotice(
				"Notifications could not be enabled. Check your connection and try again.",
			);
			track("push_registration_changed", {
				enabled: false,
				outcome: "failed",
			});
			return;
		}
		if (result.status === "registered") {
			const preference = {
				enabled: true,
				expoPushToken: result.expoPushToken,
			};
			await writeNotificationPreference(userId, preference);
			setNotificationPreferenceState(preference);
			track("push_registration_changed", {
				enabled: true,
				outcome: "registered",
			});
			return;
		}

		const preference = disabledPreference();
		await writeNotificationPreference(userId, preference);
		setNotificationPreferenceState(preference);
		if (result.status === "denied") {
			setNotificationNotice(
				"Notifications are off in iOS Settings. Update permissions to enable them.",
			);
			await Linking.openSettings();
		} else {
			setNotificationNotice(
				"Push notifications require a physical iOS device.",
			);
		}
		track("push_registration_changed", {
			enabled: false,
			outcome: result.status,
		});
	}

	async function sendTestNotification() {
		await usersClientRef.current?.sendTestNotification();
	}

	return {
		state: {
			appearancePreference,
			appEnv: readAppEnvFromExpoExtra(extra),
			appVersion: Constants.expoConfig?.version ?? "Unknown",
			notificationsEnabled: notificationPreference.enabled,
			notificationNotice,
			privacyPolicyUrl,
			termsUrl,
		},
		actions: {
			openPrivacyPolicy: () => openConfiguredUrl(privacyPolicyUrl),
			sendTestNotification,
			openTerms: () => openConfiguredUrl(termsUrl),
			setAppearancePreference,
			setNotificationsEnabled,
			signOut,
		},
	};
}

function publicExtraString(
	extra: Record<string, unknown> | undefined,
	key: string,
): string | null {
	const value = extra?.[key];
	return typeof value === "string" && value.trim().length > 0 ? value : null;
}

async function openConfiguredUrl(url: string | null): Promise<void> {
	if (!url) return;
	await WebBrowser.openBrowserAsync(url);
}
