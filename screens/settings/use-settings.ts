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
import { useLogger } from "@/lib/logger";
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
	notice: string | null;
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
	const { signOut } = useAuthenticatedAppSession();
	const logger = useLogger();
	const extra = Constants.expoConfig?.extra;
	const [appearancePreference, setAppearancePreferenceState] =
		useState<AppearancePreference>("system");
	const [notificationPreference, setNotificationPreferenceState] =
		useState<NotificationPreference>(disabledPreference);
	const [notificationNotice, setNotificationNotice] = useState<string | null>(
		null,
	);
	const [notice, setNotice] = useState<string | null>(null);
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
		let active = true;
		void readAppearancePreference()
			.then((preference) => {
				if (active) setAppearancePreferenceState(preference);
			})
			.catch((error: unknown) => {
				logger.error("settings appearance preference load failed", { error });
			});
		void readNotificationPreference()
			.then((preference) => {
				if (active) setNotificationPreferenceState(preference);
			})
			.catch((error: unknown) => {
				logger.error("settings notification preference load failed", { error });
			});
		return () => {
			active = false;
		};
	}, [logger]);

	async function setAppearancePreference(preference: AppearancePreference) {
		try {
			await writeAppearancePreference(preference);
			setAppearancePreferenceState(preference);
			setNotice(null);
			// Only the light Unistyles theme exists today. When a dark theme lands,
			// apply this with UnistylesRuntime.setAdaptiveThemes(true) or setTheme(...).
			track("appearance_preference_changed", { preference });
		} catch (error) {
			logger.error("settings appearance preference write failed", { error });
			setNotice("Unable to update appearance. Try again.");
		}
	}

	async function openConfiguredUrl(url: string | null): Promise<void> {
		if (!url) return;
		try {
			await WebBrowser.openBrowserAsync(url);
			setNotice(null);
		} catch (error) {
			logger.error("settings legal link failed", { error });
			setNotice("Unable to open link. Try again.");
		}
	}

	async function setNotificationsEnabled(enabled: boolean) {
		setNotificationNotice(null);
		const client = usersClientRef.current;
		if (!client) return;

		if (!enabled) {
			await unregisterPushNotifications({
				client,
				expoPushToken: notificationPreference.expoPushToken,
			});
			const preference = disabledPreference();
			await writeNotificationPreference(preference);
			setNotificationPreferenceState(preference);
			track("push_registration_changed", {
				enabled: false,
				outcome: "unregistered",
			});
			return;
		}

		const result = await registerForPushNotifications({ client });
		if (result.status === "registered") {
			const preference: NotificationPreference = {
				enabled: true,
				expoPushToken: result.expoPushToken,
			};
			await writeNotificationPreference(preference);
			setNotificationPreferenceState(preference);
			track("push_registration_changed", {
				enabled: true,
				outcome: "registered",
			});
			return;
		}

		const preference = disabledPreference();
		await writeNotificationPreference(preference);
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
			notice,
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
