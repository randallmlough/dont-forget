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
	disabledPreference,
	type NotificationPreference,
	readNotificationPreference,
	writeNotificationPreference,
} from "@/lib/push/notification-preference";
import {
	registerForPushNotifications,
	unregisterPushNotifications,
} from "@/lib/push/registration";
import {
	type AppearancePreference,
	readAppearancePreference,
	writeAppearancePreference,
} from "./appearance-preference";

export type SettingsState = {
	appearancePreference: AppearancePreference;
	appEnv: AppEnv;
	appVersion: string;
	notice: string | null;
	notificationsEnabled: boolean;
	notificationNotice: string | null;
	user: SettingsUser;
	userNotice: string | null;
	userError: string | null;
	userUpdateInFlight: boolean;
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
	updateUserName: (input: {
		firstName: string | null;
		lastName: string | null;
	}) => Promise<boolean>;
};

export type SettingsUser = {
	id: string | null;
	email: string | null;
	displayName: string | null;
	firstName: string | null;
	lastName: string | null;
};

export function useSettings(clientProp?: UsersApiClient): {
	state: SettingsState;
	actions: SettingsActions;
} {
	const { getToken } = useAuth();
	const { reloadSession, session, signOut } = useAuthenticatedAppSession();
	const logger = useLogger();
	const userId = session?.user.id ?? null;
	const extra = Constants.expoConfig?.extra;
	const [appearancePreference, setAppearancePreferenceState] =
		useState<AppearancePreference>("system");
	const [notificationPreference, setNotificationPreferenceState] =
		useState<NotificationPreference>(disabledPreference);
	const [notificationNotice, setNotificationNotice] = useState<string | null>(
		null,
	);
	const [notice, setNotice] = useState<string | null>(null);
	const [updatedUser, setUpdatedUser] = useState<SettingsUser | null>(null);
	const [userNotice, setUserNotice] = useState<string | null>(null);
	const [userError, setUserError] = useState<string | null>(null);
	const [userUpdateInFlight, setUserUpdateInFlight] = useState(false);
	const privacyPolicyUrl = publicExtraString(extra, "privacyPolicyUrl");
	const termsUrl = publicExtraString(extra, "termsUrl");
	const sessionUser = userFromSession(session);
	const user = updatedUser?.id === sessionUser.id ? updatedUser : sessionUser;
	const getTokenRef = useRef(getToken);
	const usersClientRef = useRef<UsersApiClient | null>(null);

	useEffect(() => {
		getTokenRef.current = getToken;
	}, [getToken]);

	function resolveClient(): UsersApiClient {
		if (clientProp) return clientProp;
		usersClientRef.current ??= createUsersApiClient({
			getToken: () => getTokenRef.current(),
		});
		return usersClientRef.current;
	}

	useEffect(() => {
		let active = true;
		void readAppearancePreference()
			.then((preference) => {
				if (active) setAppearancePreferenceState(preference);
			})
			.catch((error: unknown) => {
				logger.error("settings appearance preference load failed", { error });
			});
		void readNotificationPreference(userId)
			.then((preference) => {
				if (active) setNotificationPreferenceState(preference);
			})
			.catch((error: unknown) => {
				logger.error("settings notification preference load failed", { error });
			});
		return () => {
			active = false;
		};
	}, [logger, userId]);

	async function setAppearancePreference(preference: AppearancePreference) {
		try {
			await writeAppearancePreference(preference);
			setAppearancePreferenceState(preference);
			setNotice(null);
			track("appearance_preference_changed", { preference });
		} catch (error) {
			logger.error("settings appearance preference write failed", { error });
			setNotice("Unable to update appearance. Try again.");
		}
	}

	async function setNotificationsEnabled(enabled: boolean) {
		setNotificationNotice(null);
		const client = resolveClient();
		if (!userId) {
			setNotificationNotice("Sign in again to update notification settings.");
			return;
		}

		if (!enabled) {
			try {
				await unregisterPushNotifications({
					client,
					expoPushToken: notificationPreference.expoPushToken,
				});
			} catch {
				setNotificationNotice(
					"Notifications could not be disabled. Check your connection and try again.",
				);
				track("push_registration_changed", {
					enabled: true,
					outcome: "failed",
				});
				return;
			}
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
			const preference: NotificationPreference = {
				enabled: true,
				expoPushToken: result.expoPushToken,
			};
			try {
				await writeNotificationPreference(userId, preference);
			} catch {
				await unregisterPushNotifications({
					client,
					expoPushToken: result.expoPushToken,
				}).catch((error: unknown) => {
					logger.error("settings push registration rollback failed", {
						error,
					});
				});
				setNotificationPreferenceState(disabledPreference());
				setNotificationNotice(
					"Notifications could not be enabled. Check your connection and try again.",
				);
				track("push_registration_changed", {
					enabled: false,
					outcome: "failed",
				});
				return;
			}
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
		await resolveClient().sendTestNotification();
	}

	async function updateUserName(input: {
		firstName: string | null;
		lastName: string | null;
	}): Promise<boolean> {
		if (userUpdateInFlight) return false;
		setUserUpdateInFlight(true);
		setUserNotice(null);
		setUserError(null);
		try {
			const updatedUser = await resolveClient().updateUserName(input);
			setUpdatedUser(updatedUser);
			setUserNotice("User name updated.");
			reloadSession();
			track("user_name_updated", { user_id: updatedUser.id });
			return true;
		} catch (error) {
			setUserError(
				error instanceof Error
					? error.message
					: "Unable to update User name. Please try again.",
			);
			return false;
		} finally {
			setUserUpdateInFlight(false);
		}
	}

	return {
		state: {
			appearancePreference,
			appEnv: readAppEnvFromExpoExtra(extra),
			appVersion: Constants.expoConfig?.version ?? "Unknown",
			notice,
			notificationsEnabled: notificationPreference.enabled,
			notificationNotice,
			user,
			userNotice,
			userError,
			userUpdateInFlight,
			privacyPolicyUrl,
			termsUrl,
		},
		actions: {
			openPrivacyPolicy: () =>
				openConfiguredUrl(
					privacyPolicyUrl,
					() => setNotice(null),
					(error) => {
						logger.error("settings legal link failed", { error });
						setNotice("Unable to open link. Try again.");
					},
				),
			sendTestNotification,
			openTerms: () =>
				openConfiguredUrl(
					termsUrl,
					() => setNotice(null),
					(error) => {
						logger.error("settings legal link failed", { error });
						setNotice("Unable to open link. Try again.");
					},
				),
			setAppearancePreference,
			setNotificationsEnabled,
			signOut,
			updateUserName,
		},
	};
}

async function openConfiguredUrl(
	url: string | null,
	onSuccess: () => void,
	onFailure: (error: unknown) => void,
): Promise<void> {
	if (!url) return;
	try {
		await WebBrowser.openBrowserAsync(url);
		onSuccess();
	} catch (error) {
		onFailure(error);
	}
}

function userFromSession(
	session: ReturnType<typeof useAuthenticatedAppSession>["session"],
): SettingsUser {
	return {
		id: session?.user.id ?? null,
		email: session?.user.email ?? null,
		displayName: session?.user.displayName ?? null,
		firstName: session?.user.firstName ?? null,
		lastName: session?.user.lastName ?? null,
	};
}

function publicExtraString(
	extra: Record<string, unknown> | undefined,
	key: string,
): string | null {
	const value = extra?.[key];
	return typeof value === "string" && value.trim().length > 0 ? value : null;
}
