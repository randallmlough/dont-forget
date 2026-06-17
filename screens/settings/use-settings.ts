import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";

import { useAuthenticatedAppSession } from "@/components/session";
import { track } from "@/lib/analytics";
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
	const logger = useLogger();
	const extra = Constants.expoConfig?.extra;
	const [appearancePreference, setAppearancePreferenceState] =
		useState<AppearancePreference>("system");
	const [notice, setNotice] = useState<string | null>(null);
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

	return {
		state: {
			appearancePreference,
			appEnv: readAppEnvFromExpoExtra(extra),
			appVersion: Constants.expoConfig?.version ?? "Unknown",
			notice,
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
