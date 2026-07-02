import { useAuth } from "@clerk/clerk-expo";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";

import { useAuthenticatedAppSession } from "@/components/session";
import { track } from "@/lib/analytics";
import {
	createUsersApiClient,
	type UsersApiClient,
} from "@/lib/client-api/users";
import { type AppEnv, readAppEnvFromExpoExtra } from "@/lib/env";
import { useLogger } from "@/lib/logger";
import {
	type AppearancePreference,
	applyAppearancePreference,
	readAppearancePreference,
	writeAppearancePreference,
} from "@/lib/unistyles/appearance-preference";

export type SettingsState = {
	appearancePreference: AppearancePreference;
	appEnv: AppEnv;
	appVersion: string;
	notice: string | null;
	privacyPolicyUrl: string | null;
	termsUrl: string | null;
	user: SettingsUser;
	userError: string | null;
	userNotice: string | null;
	userUpdateInFlight: boolean;
};

export type SettingsActions = {
	openPrivacyPolicy: () => Promise<void>;
	openTerms: () => Promise<void>;
	setAppearancePreference: (preference: AppearancePreference) => Promise<void>;
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
	const extra = Constants.expoConfig?.extra;
	const [appearancePreference, setAppearancePreferenceState] =
		useState<AppearancePreference>("system");
	const [notice, setNotice] = useState<string | null>(null);
	const [updatedUser, setUpdatedUser] = useState<SettingsUser | null>(null);
	const [userError, setUserError] = useState<string | null>(null);
	const [userNotice, setUserNotice] = useState<string | null>(null);
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
		return () => {
			active = false;
		};
	}, [logger]);

	async function setAppearancePreference(preference: AppearancePreference) {
		try {
			await writeAppearancePreference(preference);
			applyAppearancePreference(preference);
			setAppearancePreferenceState(preference);
			setNotice(null);
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
			privacyPolicyUrl,
			termsUrl,
			user,
			userError,
			userNotice,
			userUpdateInFlight,
		},
		actions: {
			openPrivacyPolicy: () => openConfiguredUrl(privacyPolicyUrl),
			openTerms: () => openConfiguredUrl(termsUrl),
			setAppearancePreference,
			signOut,
			updateUserName,
		},
	};
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
