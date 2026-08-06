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
	});

	it("persists and reads the last Authenticated App Session payload", async () => {
		const session = sessionFixture();
		jest
			.mocked(AsyncStorage.getItem)
			.mockResolvedValueOnce(JSON.stringify(session));

		await persistAuthenticatedAppSession(session);

		expect(AsyncStorage.setItem).toHaveBeenCalledWith(
			SESSION_HINT_KEY,
			JSON.stringify(session),
		);
		await expect(readPersistedAuthenticatedAppSession()).resolves.toEqual(
			session,
		);
	});

	it("treats a valid persisted payload as the cold-start hint", async () => {
		jest
			.mocked(AsyncStorage.getItem)
			.mockResolvedValueOnce(JSON.stringify(sessionFixture()));

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
