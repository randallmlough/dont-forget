import {
	discardCachedBootstrapMetadataIfUnauthorized,
	OFFLINE_BOOTSTRAP_CACHE_KEY,
	type OfflineBootstrapStorage,
	saveCachedBootstrapMetadata,
} from "@/lib/app/offline-bootstrap-cache";
import type { BootstrapResponse } from "@/lib/bootstrap";

describe("offline bootstrap cache", () => {
	it("stores cached bootstrap metadata without Household DB auth tokens", async () => {
		const storage = memoryStorage();

		const metadata = await saveCachedBootstrapMetadata(bootstrapFixture(), {
			storage,
			now: () => 1_700_000_000_100,
		});
		const raw = await storage.getItem(OFFLINE_BOOTSTRAP_CACHE_KEY);

		expect(raw).not.toContain("secret-household-token");
		expect(metadata.householdDatabase).toEqual({
			url: "libsql://example.turso.io",
			expiresAt: 1_700_000_000_000,
		});
		expect(metadata.initializedAt).toBe(1_700_000_000_100);
		expect(Object.hasOwn(metadata.householdDatabase, "authToken")).toBe(false);
	});

	it("discards cached Household metadata and local data when fresh bootstrap authorizes a different Household", async () => {
		const storage = memoryStorage();
		const deleteHouseholdData = jest.fn(async () => undefined);
		const oldBootstrap = bootstrapFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const freshBootstrap = bootstrapFixture({
			householdId: "hh_new",
			householdName: "New",
		});

		await saveCachedBootstrapMetadata(oldBootstrap, { storage });

		await expect(
			discardCachedBootstrapMetadataIfUnauthorized(freshBootstrap, {
				storage,
				deleteHouseholdData,
			}),
		).resolves.toMatchObject({ activeHousehold: { id: "hh_old" } });
		expect(deleteHouseholdData).toHaveBeenCalledWith("hh_old");
		await expect(
			storage.getItem(OFFLINE_BOOTSTRAP_CACHE_KEY),
		).resolves.toBeNull();
	});
});

function memoryStorage(): OfflineBootstrapStorage {
	const values = new Map<string, string>();

	return {
		async getItem(key) {
			return values.get(key) ?? null;
		},
		async setItem(key, value) {
			values.set(key, value);
		},
		async removeItem(key) {
			values.delete(key);
		},
	};
}

function bootstrapFixture(
	overrides: { householdId?: string; householdName?: string } = {},
): BootstrapResponse {
	const householdId = overrides.householdId ?? "hh_avery";

	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
		},
		activeHousehold: {
			id: householdId,
			name: overrides.householdName ?? "Avery",
		},
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner",
			displayName: "Avery Chen",
		},
		activeList: { id: "lst_default_groceries", name: "Groceries" },
		members: [
			{
				membershipId: "mbr_avery",
				userId: "usr_avery",
				role: "owner",
				displayName: "Avery Chen",
			},
		],
		householdDatabase: {
			url: "libsql://example.turso.io",
			authToken: "secret-household-token",
			expiresAt: 1_700_000_000_000,
		},
	};
}
