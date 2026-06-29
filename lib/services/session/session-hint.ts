import AsyncStorage from "@react-native-async-storage/async-storage";

const AUTHENTICATED_APP_SESSION_HINT_KEY =
	"dont-forget:authenticated-app-session:available";

export async function markAuthenticatedAppSessionAvailable(): Promise<void> {
	await AsyncStorage.setItem(AUTHENTICATED_APP_SESSION_HINT_KEY, "1");
}

export async function clearAuthenticatedAppSessionAvailability(): Promise<void> {
	await AsyncStorage.removeItem(AUTHENTICATED_APP_SESSION_HINT_KEY);
}

export async function hasPersistedAuthenticatedAppSession(): Promise<boolean> {
	return (
		(await AsyncStorage.getItem(AUTHENTICATED_APP_SESSION_HINT_KEY)) === "1"
	);
}
