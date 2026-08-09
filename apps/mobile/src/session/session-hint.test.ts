import type { BootstrapResponse } from "@dont-forget/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	clearAuthenticatedAppSessionPresent,
	hasAuthenticatedAppSessionHint,
	persistAuthenticatedAppSession,
	readPersistedAuthenticatedAppSession,
} from "./session-hint";

const SESSION_HINT_KEY = "dont-forget/authenticated-app-session-present";

describe("Authenticated App Session restore payload", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.mocked(AsyncStorage.removeItem).mockResolvedValue(undefined);
	});

	it("persists and reads the last Authenticated App Session payload", async () => {
		const session = sessionFixture();
		const persistedSession = { clerkUserId: "user_avery", session };
		jest
			.mocked(AsyncStorage.getItem)
			.mockResolvedValueOnce(JSON.stringify(persistedSession));

		await persistAuthenticatedAppSession(persistedSession);

		expect(AsyncStorage.setItem).toHaveBeenCalledWith(
			SESSION_HINT_KEY,
			JSON.stringify(persistedSession),
		);
		await expect(readPersistedAuthenticatedAppSession()).resolves.toEqual(
			persistedSession,
		);
	});

	it("validates the Clerk-bound envelope before persisting it", async () => {
		await expect(
			persistAuthenticatedAppSession({
				clerkUserId: "",
				session: sessionFixture(),
			}),
		).rejects.toThrow();
		expect(AsyncStorage.setItem).not.toHaveBeenCalled();
	});

	it("treats a valid persisted payload as the cold-start hint", async () => {
		jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(
			JSON.stringify({
				clerkUserId: "user_avery",
				session: sessionFixture(),
			}),
		);

		await expect(hasAuthenticatedAppSessionHint()).resolves.toBe(true);
	});

	it("returns null and no hint when the payload is absent", async () => {
		jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(null);
		jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(null);

		await expect(readPersistedAuthenticatedAppSession()).resolves.toBeNull();
		await expect(hasAuthenticatedAppSessionHint()).resolves.toBe(false);
	});

	it("returns null and no hint when the payload is corrupt or schema-invalid", async () => {
		jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce("{not json");
		jest
			.mocked(AsyncStorage.getItem)
			.mockResolvedValueOnce(JSON.stringify("1"));

		await expect(readPersistedAuthenticatedAppSession()).resolves.toBeNull();
		await expect(hasAuthenticatedAppSessionHint()).resolves.toBe(false);
	});

	it("clears a legacy payload that is not bound to a Clerk subject", async () => {
		jest
			.mocked(AsyncStorage.getItem)
			.mockResolvedValueOnce(JSON.stringify(sessionFixture()));

		await expect(readPersistedAuthenticatedAppSession()).resolves.toBeNull();
		expect(AsyncStorage.removeItem).toHaveBeenCalledWith(SESSION_HINT_KEY);
	});

	it("clears the same persisted payload key used for the restore hint", async () => {
		await clearAuthenticatedAppSessionPresent();

		expect(AsyncStorage.removeItem).toHaveBeenCalledWith(SESSION_HINT_KEY);
	});
});

function sessionFixture(): BootstrapResponse {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery",
			firstName: "Avery",
			lastName: "Chen",
		},
		activeHousehold: { id: "hh_avery", name: "Avery's Home" },
		households: [
			{ id: "hh_avery", name: "Avery's Home", role: "owner", isActive: true },
		],
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner",
			displayName: "Avery",
		},
		members: [
			{
				membershipId: "mbr_avery",
				userId: "usr_avery",
				role: "owner",
				displayName: "Avery",
			},
		],
	};
}
