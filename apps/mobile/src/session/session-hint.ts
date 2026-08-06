import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	type BootstrapResponse,
	bootstrapResponseSchema,
} from "@dont-forget/shared";

// Cold-start restore payload. `auth-gate` reads its presence before the session
// has had a chance to activate, and the session provider reads the same payload
// to restore an offline Authenticated App Session. The payload is directory
// identity only; it must never include Clerk or PowerSync tokens.
const SESSION_HINT_KEY = "dont-forget/authenticated-app-session-present";

export async function persistAuthenticatedAppSession(
	payload: BootstrapResponse,
): Promise<void> {
	await AsyncStorage.setItem(SESSION_HINT_KEY, JSON.stringify(payload));
}

export async function clearAuthenticatedAppSessionPresent(): Promise<void> {
	await AsyncStorage.removeItem(SESSION_HINT_KEY);
}

export async function readPersistedAuthenticatedAppSession(): Promise<BootstrapResponse | null> {
	const raw = await AsyncStorage.getItem(SESSION_HINT_KEY);
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		return bootstrapResponseSchema.parse(parsed);
	} catch {
		return null;
	}
}

export async function hasAuthenticatedAppSessionHint(): Promise<boolean> {
	return (await readPersistedAuthenticatedAppSession()) !== null;
}
