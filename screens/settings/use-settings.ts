import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";

import { useAuthenticatedAppSession } from "@/components/session";
import { track } from "@/lib/analytics";
import { type AppEnv, readAppEnvFromExpoExtra } from "@/lib/env";
import {
	type AppearancePreference,
	readAppearancePreference,
	writeAppearancePreference,
} from "./appearance-preference";

export type SettingsState = {
	appearancePreference: AppearancePreference;
	appEnv: AppEnv;
	appVersion: string;
	privacyPolicyUrl: string | null;
	termsUrl: string | null;
};

export type SettingsActions = {
	openPrivacyPolicy: () => Promise<void>;
	openTerms: () => Promise<void>;
	setAppearancePreference: (preference: AppearancePreference) => Promise<void>;
	signOut: () => Promise<void>;
};

export function useSettings(): {
	state: SettingsState;
	actions: SettingsActions;
} {
	const { signOut } = useAuthenticatedAppSession();
	const extra = Constants.expoConfig?.extra;
	const [appearancePreference, setAppearancePreferenceState] =
		useState<AppearancePreference>("system");
	const privacyPolicyUrl = publicExtraString(extra, "privacyPolicyUrl");
	const termsUrl = publicExtraString(extra, "termsUrl");

	useEffect(() => {
		track("settings_opened", { source: "home" });
		let active = true;
		void readAppearancePreference().then((preference) => {
			if (active) setAppearancePreferenceState(preference);
		});
		return () => {
			active = false;
		};
	}, []);

	async function setAppearancePreference(preference: AppearancePreference) {
		await writeAppearancePreference(preference);
		setAppearancePreferenceState(preference);
		// Only the light Unistyles theme exists today. When a dark theme lands,
		// apply this with UnistylesRuntime.setAdaptiveThemes(true) or setTheme(...).
		track("appearance_preference_changed", { preference });
	}

	return {
		state: {
			appearancePreference,
			appEnv: readAppEnvFromExpoExtra(extra),
			appVersion: Constants.expoConfig?.version ?? "Unknown",
			privacyPolicyUrl,
			termsUrl,
		},
		actions: {
			openPrivacyPolicy: () => openConfiguredUrl(privacyPolicyUrl),
			openTerms: () => openConfiguredUrl(termsUrl),
			setAppearancePreference,
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
