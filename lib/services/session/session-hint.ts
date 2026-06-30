import AsyncStorage from "@react-native-async-storage/async-storage";

// Cold-start hint. A persisted flag recording that this device most recently had
// a ready Authenticated App Session. `auth-gate` reads it before the session has
// had a chance to activate, to choose the initial redirect without flashing the
// auth screen at a signed-in returning user; the session controller sets it once
// a session is ready, and sign-out clears it. This replaces the deleted bootstrap
// cache's cold-start presence check — PowerSync owns the local data now, so the
// gate only needs this lightweight "was signed in" signal.
const SESSION_HINT_KEY = "dont-forget/authenticated-app-session-present";

export async function markAuthenticatedAppSessionPresent(): Promise<void> {
	await AsyncStorage.setItem(SESSION_HINT_KEY, "1");
}

export async function clearAuthenticatedAppSessionPresent(): Promise<void> {
	await AsyncStorage.removeItem(SESSION_HINT_KEY);
}

export async function hasAuthenticatedAppSessionHint(): Promise<boolean> {
	return (await AsyncStorage.getItem(SESSION_HINT_KEY)) === "1";
}
