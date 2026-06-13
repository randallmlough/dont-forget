import AsyncStorage from "@react-native-async-storage/async-storage";

export type AppearancePreference = "system" | "light" | "dark";

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

function isAppearancePreference(
	value: string | null,
): value is AppearancePreference {
	return (
		value !== null && APPEARANCE_PREFERENCES.has(value as AppearancePreference)
	);
}
