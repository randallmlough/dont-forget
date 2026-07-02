import Constants from "expo-constants";

/**
 * Resolve the PowerSync sync-service endpoint.
 *
 * `app.config.ts` bakes `EXPO_PUBLIC_POWERSYNC_URL` into Expo config extra
 * (PR-B) in every build, so — unlike the API base URL — there is no dev-server
 * branch: the connector always reads the explicit value here.
 */
export function readPowerSyncUrl(): string {
	const value = Constants.expoConfig?.extra?.powersyncUrl;
	if (typeof value !== "string" || value.length === 0) {
		throw new Error("Missing EXPO_PUBLIC_POWERSYNC_URL");
	}

	return value;
}
