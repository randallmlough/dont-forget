import Constants from "expo-constants";
// React Native's own record of where the JS bundle was loaded from. Not a
// public API, but it is the same source RN dev tooling uses, and it carries
// the real scheme — `expoConfig.hostUri` does not, which would break HTTPS
// tunnel origins (e.g. `expo start --tunnel` via exp.direct).
import getDevServer from "react-native/Libraries/Core/Devtools/getDevServer";

import { readAppEnvFromExpoExtra } from "@/lib/env";

/**
 * Resolve the base URL for the app's own API routes.
 *
 * In `local` builds the API routes are served by the same Expo dev server
 * that bundled the JS, so the URL is taken from the dev-server URL the
 * bundle actually loaded from (scheme, host, and port). This makes the dev
 * server structurally the single source of truth: a worktree running Metro
 * on a non-default port cannot silently call another checkout's server,
 * physical devices reach the host machine via the address embedded in the
 * bundle URL, and tunneled HTTPS origins keep their scheme.
 *
 * Staging and production builds have no dev server; they read the URL from
 * `EXPO_PUBLIC_API_BASE_URL` via Expo config extra.
 */
export function readApiBaseUrl(): string {
	const extra = Constants.expoConfig?.extra;
	const appEnv = readAppEnvFromExpoExtra(extra);

	if (appEnv === "local") {
		const devServer = getDevServer();
		if (!devServer.bundleLoadedFromServer) {
			throw new Error(
				"local builds derive the API base URL from the Expo dev server, but this bundle was not loaded from one",
			);
		}

		return devServer.url.replace(/\/$/, "");
	}

	const value = extra?.apiBaseUrl;
	if (typeof value !== "string" || value.length === 0) {
		throw new Error("Missing EXPO_PUBLIC_API_BASE_URL");
	}

	return value.replace(/\/$/, "");
}
