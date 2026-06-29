import Constants from "expo-constants";

export function readPowerSyncUrl(): string {
	const value = Constants.expoConfig?.extra?.powersyncUrl;
	if (typeof value === "string" && value.trim().length > 0) {
		return value;
	}

	throw new Error("Missing EXPO_PUBLIC_POWERSYNC_URL");
}
