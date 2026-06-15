import AsyncStorage from "@react-native-async-storage/async-storage";
import { UnistylesRuntime } from "react-native-unistyles";

import type { Logger } from "@/lib/logger";

export type AppearancePreference = "system" | "light" | "dark";

type LoadAppearancePreferenceOptions = {
	isActive?: () => boolean;
	logger?: Pick<Logger, "error">;
};

const APPEARANCE_PREFERENCE_KEY = "appearance-preference";
const APPEARANCE_PREFERENCES = new Set<AppearancePreference>([
	"system",
	"light",
	"dark",
]);

export async function readAppearancePreference(): Promise<AppearancePreference> {
	const value = await AsyncStorage.getItem(APPEARANCE_PREFERENCE_KEY);
	return isAppearancePreference(value) ? value : "system";
}

export async function writeAppearancePreference(
	preference: AppearancePreference,
): Promise<void> {
	await AsyncStorage.setItem(APPEARANCE_PREFERENCE_KEY, preference);
}

export function applyAppearancePreference(
	preference: AppearancePreference,
): void {
	switch (preference) {
		case "system":
			UnistylesRuntime.setAdaptiveThemes(true);
			return;
		case "light":
		case "dark":
			UnistylesRuntime.setAdaptiveThemes(false);
			UnistylesRuntime.setTheme(preference);
			return;
	}
}

export async function loadAndApplyAppearancePreference({
	isActive,
	logger,
}: LoadAppearancePreferenceOptions = {}): Promise<void> {
	try {
		const preference = await readAppearancePreference();
		if (isActive?.() === false) return;
		applyAppearancePreference(preference);
	} catch (error) {
		logger?.error("appearance preference startup failed", { error });
	}
}

function isAppearancePreference(
	value: string | null,
): value is AppearancePreference {
	return (
		value !== null && APPEARANCE_PREFERENCES.has(value as AppearancePreference)
	);
}
