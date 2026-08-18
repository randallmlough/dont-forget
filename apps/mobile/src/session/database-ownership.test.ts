import { createDatabaseOwnership } from "./database-ownership";
import type { PersistedAuthenticatedAppSession } from "./session-hint";

describe("database ownership", () => {
	it("prepares a matching owner without clearing or rewriting ownership", async () => {
		const storage = createMemoryStorage();
		const disconnectAndClear = jest.fn(async () => undefined);
		const ownership = createDatabaseOwnership({
			getStorageItem: storage.getItem,
			setStorageItem: storage.setItem,
			readLocalUserRows: async () => [],
			readPersistedAuthenticatedAppSession: async () => null,
			disconnectAndClear,
		});

		await expect(ownership.prepareForUser("usr_avery")).resolves.toEqual({
			status: "ready",
		});
		storage.setItem.mockClear();

		await expect(ownership.prepareForUser("usr_avery")).resolves.toEqual({
			status: "ready",
		});
		expect(storage.setItem).not.toHaveBeenCalled();
		expect(disconnectAndClear).not.toHaveBeenCalled();
	});

	it("blocks a different owner without clearing or rewriting ownership", async () => {
		const storage = createMemoryStorage();
		const disconnectAndClear = jest.fn(async () => undefined);
		const ownership = createDatabaseOwnership({
			getStorageItem: storage.getItem,
			setStorageItem: storage.setItem,
			readLocalUserRows: async () => [],
			readPersistedAuthenticatedAppSession: async () => null,
			disconnectAndClear,
		});
		await ownership.prepareForUser("usr_avery");
		storage.setItem.mockClear();

		await expect(ownership.prepareForUser("usr_blake")).resolves.toEqual({
			status: "differentUserBlocked",
		});
		expect(storage.setItem).not.toHaveBeenCalled();
		expect(disconnectAndClear).not.toHaveBeenCalled();
	});

	it("infers and persists a different local User before blocking", async () => {
		const storage = createMemoryStorage();
		const disconnectAndClear = jest.fn(async () => undefined);
		const ownership = createDatabaseOwnership({
			getStorageItem: storage.getItem,
			setStorageItem: storage.setItem,
			readLocalUserRows: async () => [{ id: "usr_avery" }],
			readPersistedAuthenticatedAppSession: async () => null,
			disconnectAndClear,
		});

		await expect(ownership.prepareForUser("usr_blake")).resolves.toEqual({
			status: "differentUserBlocked",
		});
		expect(storage.setItem).toHaveBeenCalledTimes(1);
		expect(disconnectAndClear).not.toHaveBeenCalled();
	});

	it("infers a different owner from the persisted session when local users are empty", async () => {
		const storage = createMemoryStorage();
		const ownership = createDatabaseOwnership({
			getStorageItem: storage.getItem,
			setStorageItem: storage.setItem,
			readLocalUserRows: async () => [],
			readPersistedAuthenticatedAppSession: async () =>
				persistedSessionFixture("usr_avery"),
			disconnectAndClear: jest.fn(async () => undefined),
		});

		await expect(ownership.prepareForUser("usr_blake")).resolves.toEqual({
			status: "differentUserBlocked",
		});
		expect(storage.setItem).toHaveBeenCalledTimes(1);
	});

	it("fails closed when local User and persisted session ownership contradict", async () => {
		const storage = createMemoryStorage();
		const disconnectAndClear = jest.fn(async () => undefined);
		const ownership = createDatabaseOwnership({
			getStorageItem: storage.getItem,
			setStorageItem: storage.setItem,
			readLocalUserRows: async () => [{ id: "usr_avery" }],
			readPersistedAuthenticatedAppSession: async () =>
				persistedSessionFixture("usr_blake"),
			disconnectAndClear,
		});

		await expect(ownership.prepareForUser("usr_avery")).rejects.toThrow(
			"contradictory",
		);
		expect(storage.setItem).not.toHaveBeenCalled();
		expect(disconnectAndClear).not.toHaveBeenCalled();
	});

	it("infers and persists a matching local User before preparing", async () => {
		const storage = createMemoryStorage();
		const ownership = createDatabaseOwnership({
			getStorageItem: storage.getItem,
			setStorageItem: storage.setItem,
			readLocalUserRows: async () => [{ id: "usr_avery" }],
			readPersistedAuthenticatedAppSession: async () => null,
			disconnectAndClear: jest.fn(async () => undefined),
		});

		await expect(ownership.prepareForUser("usr_avery")).resolves.toEqual({
			status: "ready",
		});
		expect(storage.setItem).toHaveBeenCalledTimes(1);
	});

	it("infers and persists a matching persisted session when local users are empty", async () => {
		const storage = createMemoryStorage();
		const ownership = createDatabaseOwnership({
			getStorageItem: storage.getItem,
			setStorageItem: storage.setItem,
			readLocalUserRows: async () => [],
			readPersistedAuthenticatedAppSession: async () =>
				persistedSessionFixture("usr_avery"),
			disconnectAndClear: jest.fn(async () => undefined),
		});

		await expect(ownership.prepareForUser("usr_avery")).resolves.toEqual({
			status: "ready",
		});
		expect(storage.setItem).toHaveBeenCalledTimes(1);
	});

	it("claims a new database for the incoming User when no evidence exists", async () => {
		const storage = createMemoryStorage();
		const ownership = createDatabaseOwnership({
			getStorageItem: storage.getItem,
			setStorageItem: storage.setItem,
			readLocalUserRows: async () => [],
			readPersistedAuthenticatedAppSession: async () => null,
			disconnectAndClear: jest.fn(async () => undefined),
		});

		await expect(ownership.prepareForUser("usr_avery")).resolves.toEqual({
			status: "ready",
		});
		expect(storage.setItem).toHaveBeenCalledTimes(1);
	});

	it("fails closed when multiple local Users exist", async () => {
		const storage = createMemoryStorage();
		const disconnectAndClear = jest.fn(async () => undefined);
		const ownership = createDatabaseOwnership({
			getStorageItem: storage.getItem,
			setStorageItem: storage.setItem,
			readLocalUserRows: async () => [{ id: "usr_avery" }, { id: "usr_blake" }],
			readPersistedAuthenticatedAppSession: async () => null,
			disconnectAndClear,
		});

		await expect(ownership.prepareForUser("usr_avery")).rejects.toThrow(
			"multiple User owners",
		);
		expect(storage.setItem).not.toHaveBeenCalled();
		expect(disconnectAndClear).not.toHaveBeenCalled();
	});

	it("rejects an unreadable durable owner marker", async () => {
		const disconnectAndClear = jest.fn(async () => undefined);
		const ownership = createDatabaseOwnership({
			getStorageItem: async () => "{not json",
			setStorageItem: jest.fn(async () => undefined),
			readLocalUserRows: async () => [],
			readPersistedAuthenticatedAppSession: async () => null,
			disconnectAndClear,
		});

		await expect(ownership.prepareForUser("usr_avery")).rejects.toThrow();
		expect(disconnectAndClear).not.toHaveBeenCalled();
	});

	it("allows a restored session only when its internal User matches the owner", async () => {
		const storage = createMemoryStorage();
		const ownership = createDatabaseOwnership({
			getStorageItem: storage.getItem,
			setStorageItem: storage.setItem,
			readLocalUserRows: async () => [],
			readPersistedAuthenticatedAppSession: async () =>
				persistedSessionFixture("usr_avery"),
			disconnectAndClear: jest.fn(async () => undefined),
		});
		await ownership.prepareForUser("usr_avery");

		await expect(ownership.prepareForUser("usr_avery")).resolves.toEqual({
			status: "ready",
		});
		await expect(ownership.prepareForUser("usr_blake")).resolves.toEqual({
			status: "differentUserBlocked",
		});
	});

	it("clears and assigns the incoming User only after confirmed removal", async () => {
		const storage = createMemoryStorage();
		const disconnectAndClear = jest.fn(async () => undefined);
		const ownership = createDatabaseOwnership({
			getStorageItem: storage.getItem,
			setStorageItem: storage.setItem,
			readLocalUserRows: async () => [],
			readPersistedAuthenticatedAppSession: async () => null,
			disconnectAndClear,
		});
		await ownership.prepareForUser("usr_avery");

		await expect(
			ownership.removePreviousUserDataAndPrepare("usr_blake"),
		).resolves.toBeUndefined();
		expect(disconnectAndClear).toHaveBeenCalledTimes(1);
		await expect(ownership.prepareForUser("usr_blake")).resolves.toEqual({
			status: "ready",
		});
		await expect(ownership.prepareForUser("usr_avery")).resolves.toEqual({
			status: "differentUserBlocked",
		});
	});

	it("keeps the previous owner when confirmed clearing fails", async () => {
		const storage = createMemoryStorage();
		const disconnectAndClear = jest.fn(async () => undefined);
		const ownership = createDatabaseOwnership({
			getStorageItem: storage.getItem,
			setStorageItem: storage.setItem,
			readLocalUserRows: async () => [],
			readPersistedAuthenticatedAppSession: async () => null,
			disconnectAndClear,
		});
		await ownership.prepareForUser("usr_avery");
		disconnectAndClear.mockRejectedValueOnce(new Error("clear failed"));

		await expect(
			ownership.removePreviousUserDataAndPrepare("usr_blake"),
		).rejects.toThrow("clear failed");
		await expect(ownership.prepareForUser("usr_blake")).resolves.toEqual({
			status: "differentUserBlocked",
		});
	});

	it("remains non-connectable when assigning the incoming owner fails after clearing", async () => {
		const storage = createMemoryStorage();
		const disconnectAndClear = jest.fn(async () => undefined);
		const ownership = createDatabaseOwnership({
			getStorageItem: storage.getItem,
			setStorageItem: storage.setItem,
			readLocalUserRows: async () => [],
			readPersistedAuthenticatedAppSession: async () => null,
			disconnectAndClear,
		});
		await ownership.prepareForUser("usr_avery");
		storage.setItem.mockRejectedValueOnce(new Error("owner write failed"));

		await expect(
			ownership.removePreviousUserDataAndPrepare("usr_blake"),
		).rejects.toThrow("owner write failed");
		expect(disconnectAndClear).toHaveBeenCalledTimes(1);
		await expect(ownership.prepareForUser("usr_blake")).resolves.toEqual({
			status: "differentUserBlocked",
		});
	});
});

function createMemoryStorage() {
	const values = new Map<string, string>();
	return {
		getItem: jest.fn(async (key: string) => values.get(key) ?? null),
		setItem: jest.fn(async (key: string, value: string) => {
			values.set(key, value);
		}),
	};
}

function persistedSessionFixture(
	internalUserId: string,
): PersistedAuthenticatedAppSession {
	return {
		clerkUserId: `clerk_${internalUserId}`,
		session: {
			user: {
				id: internalUserId,
				email: null,
				displayName: null,
				firstName: null,
				lastName: null,
			},
			activeHousehold: { id: "hh_home", name: "Home" },
			households: [
				{ id: "hh_home", name: "Home", role: "owner", isActive: true },
			],
			activeMember: {
				id: "mbr_owner",
				userId: internalUserId,
				role: "owner",
				displayName: null,
			},
			members: [
				{
					membershipId: "mbr_owner",
					userId: internalUserId,
					role: "owner",
					displayName: null,
				},
			],
		},
	};
}
