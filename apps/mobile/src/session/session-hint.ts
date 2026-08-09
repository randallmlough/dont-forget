import { bootstrapResponseSchema } from "@dont-forget/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";

// Cold-start restore payload. `auth-gate` reads its presence before the session
// has had a chance to activate, and the session provider reads the same payload
// to restore an offline Authenticated App Session. The envelope binds directory
// identity to the non-secret Clerk subject; it must never include auth or
// PowerSync tokens.
const SESSION_HINT_KEY = "dont-forget/authenticated-app-session-present";

const persistedAuthenticatedAppSessionSchema = z.strictObject({
	clerkUserId: z.string().min(1),
	session: bootstrapResponseSchema,
});

export type PersistedAuthenticatedAppSession = z.infer<
	typeof persistedAuthenticatedAppSessionSchema
>;

export async function persistAuthenticatedAppSession(
	payload: PersistedAuthenticatedAppSession,
): Promise<void> {
	const parsed = persistedAuthenticatedAppSessionSchema.parse(payload);
	await AsyncStorage.setItem(SESSION_HINT_KEY, JSON.stringify(parsed));
}

export async function clearAuthenticatedAppSessionPresent(): Promise<void> {
	await AsyncStorage.removeItem(SESSION_HINT_KEY);
}

export async function readPersistedAuthenticatedAppSession(): Promise<PersistedAuthenticatedAppSession | null> {
	const raw = await AsyncStorage.getItem(SESSION_HINT_KEY);
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		return persistedAuthenticatedAppSessionSchema.parse(parsed);
	} catch {
		await AsyncStorage.removeItem(SESSION_HINT_KEY).catch(() => undefined);
		return null;
	}
}

export async function hasAuthenticatedAppSessionHint(): Promise<boolean> {
	return (await readPersistedAuthenticatedAppSession()) !== null;
}
