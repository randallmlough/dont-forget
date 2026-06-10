import Constants from "expo-constants";

import { readAppEnvFromExpoExtra } from "@/lib/env";

/**
 * Resolve the base URL for the app's own API routes.
 *
 * In `local` builds the API routes are served by the same Expo dev server
 * that bundled the JS, so the URL is derived from `expoConfig.hostUri` (the
 * host and port the app actually loaded its bundle from). This makes the
 * dev server structurally the single source of truth: a worktree running
 * Metro on a non-default port cannot silently call another checkout's
 * server, and physical devices reach the host machine via the LAN address
 * embedded in the bundle URL.
 *
 * Staging and production builds have no dev server; they read the URL from
 * `EXPO_PUBLIC_API_BASE_URL` via Expo config extra.
 */
export function readApiBaseUrl(): string {
	const extra = Constants.expoConfig?.extra;
	const appEnv = readAppEnvFromExpoExtra(extra);

	if (appEnv === "local") {
		const hostUri = Constants.expoConfig?.hostUri;
		if (typeof hostUri !== "string" || hostUri.length === 0) {
			throw new Error(
				"local builds derive the API base URL from the Expo dev server, but expoConfig.hostUri is missing",
			);
		}

		return `http://${hostUri.replace(/\/$/, "")}`;
	}

	const value = extra?.apiBaseUrl;
	if (typeof value !== "string" || value.length === 0) {
		throw new Error("Missing EXPO_PUBLIC_API_BASE_URL");
	}

	return value.replace(/\/$/, "");
}
