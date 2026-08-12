import Constants from "expo-constants";
// React Native's own record of where the JS bundle was loaded from. Not a
// public API, but it is the same source RN dev tooling uses, and it carries
// the real scheme — `expoConfig.hostUri` does not, which would break HTTPS
// tunnel origins (e.g. `expo start --tunnel` via exp.direct).
import getDevServer from "react-native/Libraries/Core/Devtools/getDevServer";

/**
 * Resolve the base URL for the app's own API.
 *
 * In `local` builds Metro supplies the reachable scheme and host from the
 * bundle URL, while `.env.worktree` supplies the standalone API listener port
 * baked into Expo config extra by app.config.ts. LAN development therefore
 * keeps the native host discovery seam while parallel checkouts call their
 * own API process. Expo tunnels preserve their HTTPS host but do not expose
 * the standalone API port; that limitation is accepted for local T4 wiring.
 *
 * Staging and production builds have no dev server; they read the URL from
 * `EXPO_PUBLIC_API_BASE_URL` via Expo config extra.
 */
export function readApiBaseUrl(): string {
	const extra = Constants.expoConfig?.extra;

	// Gate on the EXPLICIT appEnv baked into the Expo config (app.config.ts
	// always sets extra.appEnv in real builds). Deliberately no process.env
	// fallback: the shell environment a test runner happens to inherit (e.g.
	// APP_ENV=local) must not flip API clients into the dev-server branch
	// when a test mocks expo-constants with only an apiBaseUrl.
	if (extra?.appEnv === "local") {
		const apiPort = extra.apiPort;
		if (
			typeof apiPort !== "number" ||
			!Number.isInteger(apiPort) ||
			apiPort < 1 ||
			apiPort > 65_535
		) {
			throw new Error(
				"Expo config extra.apiPort must provide API_PORT as an integer from 1 through 65535",
			);
		}

		const devServer = getDevServer();
		if (!devServer.bundleLoadedFromServer) {
			throw new Error(
				"local builds derive the API base URL from the Expo dev server, but this bundle was not loaded from one",
			);
		}

		const parsedUrl = new URL(devServer.url);
		parsedUrl.port = String(apiPort);
		return parsedUrl.origin;
	}

	const value = extra?.apiBaseUrl;
	if (typeof value !== "string" || value.length === 0) {
		throw new Error("Missing EXPO_PUBLIC_API_BASE_URL");
	}

	return value.replace(/\/$/, "");
}
