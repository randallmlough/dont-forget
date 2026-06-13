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
	applyAppearancePreference,
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
	accountDeletionError: string | null;
	accountDeletionInFlight: boolean;
	profile: SettingsUserProfile;
	profileNotice: string | null;
	profileError: string | null;
	profileUpdateInFlight: boolean;
	privacyPolicyUrl: string | null;
	termsUrl: string | null;
};

export type SettingsActions = {
	openPrivacyPolicy: () => Promise<void>;
	sendTestNotification: () => Promise<void>;
	openTerms: () => Promise<void>;
	deleteAccount: () => Promise<boolean>;
	setAppearancePreference: (preference: AppearancePreference) => Promise<void>;
	setNotificationsEnabled: (enabled: boolean) => Promise<void>;
	signOut: () => Promise<void>;
	updateProfile: (input: {
		firstName: string | null;
		lastName: string | null;
	}) => Promise<boolean>;
};

export type SettingsUserProfile = {
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
	const { session, signOut } = useAuthenticatedAppSession();
	const extra = Constants.expoConfig?.extra;
	const [appearancePreference, setAppearancePreferenceState] =
		useState<AppearancePreference>("system");
	const [notificationPreference, setNotificationPreferenceState] =
		useState<NotificationPreference>(disabledPreference);
	const [notificationNotice, setNotificationNotice] = useState<string | null>(
		null,
	);
	const [accountDeletionError, setAccountDeletionError] = useState<
		string | null
	>(null);
	const [accountDeletionInFlight, setAccountDeletionInFlight] = useState(false);
	const [updatedProfile, setUpdatedProfile] =
		useState<SettingsUserProfile | null>(null);
	const [profileNotice, setProfileNotice] = useState<string | null>(null);
	const [profileError, setProfileError] = useState<string | null>(null);
	const [profileUpdateInFlight, setProfileUpdateInFlight] = useState(false);
	const privacyPolicyUrl = publicExtraString(extra, "privacyPolicyUrl");
	const termsUrl = publicExtraString(extra, "termsUrl");
	const sessionProfile = profileFromSession(session);
	const profile =
		updatedProfile?.id === sessionProfile.id ? updatedProfile : sessionProfile;
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
		track("settings_opened", { source: "home" });
		let active = true;
		void Promise.all([
			readAppearancePreference(),
			readNotificationPreference(),
		]).then(([appearance, notifications]) => {
			if (!active) return;
			setAppearancePreferenceState(appearance);
			setNotificationPreferenceState(notifications);
		});
		return () => {
			active = false;
		};
	}, []);

	async function setAppearancePreference(preference: AppearancePreference) {
		await writeAppearancePreference(preference);
		applyAppearancePreference(preference);
		setAppearancePreferenceState(preference);
		track("appearance_preference_changed", { preference });
	}

	async function setNotificationsEnabled(enabled: boolean) {
		setNotificationNotice(null);
		const client = resolveClient();

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
			const preference = {
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
		await resolveClient().sendTestNotification();
	}

	async function deleteAccount(): Promise<boolean> {
		if (accountDeletionInFlight) return false;
		if (!profile.id) {
			setAccountDeletionError("Account deletion failed. Please try again.");
			return false;
		}
		setAccountDeletionInFlight(true);
		setAccountDeletionError(null);
		try {
			const result = await resolveClient().deleteAccount();
			track("account_deleted", {
				user_id: profile.id,
				deleted_household_count: result.deletedHouseholdCount,
			});
			await signOut();
			return true;
		} catch {
			setAccountDeletionError("Account deletion failed. Please try again.");
			return false;
		} finally {
			setAccountDeletionInFlight(false);
		}
	}

	async function updateProfile(input: {
		firstName: string | null;
		lastName: string | null;
	}): Promise<boolean> {
		if (profileUpdateInFlight) return false;
		setProfileUpdateInFlight(true);
		setProfileNotice(null);
		setProfileError(null);
		try {
			const updatedProfile = await resolveClient().updateProfile(input);
			setUpdatedProfile(updatedProfile);
			setProfileNotice("Profile updated.");
			track("user_profile_updated", { user_id: updatedProfile.id });
			return true;
		} catch {
			setProfileError("Unable to update profile. Please try again.");
			return false;
		} finally {
			setProfileUpdateInFlight(false);
		}
	}

	return {
		state: {
			appearancePreference,
			appEnv: readAppEnvFromExpoExtra(extra),
			appVersion: Constants.expoConfig?.version ?? "Unknown",
			notificationsEnabled: notificationPreference.enabled,
			notificationNotice,
			accountDeletionError,
			accountDeletionInFlight,
			profile,
			profileNotice,
			profileError,
			profileUpdateInFlight,
			privacyPolicyUrl,
			termsUrl,
		},
		actions: {
			openPrivacyPolicy: () => openConfiguredUrl(privacyPolicyUrl),
			sendTestNotification,
			openTerms: () => openConfiguredUrl(termsUrl),
			deleteAccount,
			setAppearancePreference,
			setNotificationsEnabled,
			signOut,
			updateProfile,
		},
	};
}

function profileFromSession(
	session: ReturnType<typeof useAuthenticatedAppSession>["session"],
): SettingsUserProfile {
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

async function openConfiguredUrl(url: string | null): Promise<void> {
	if (!url) return;
	await WebBrowser.openBrowserAsync(url);
}
