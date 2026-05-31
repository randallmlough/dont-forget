import { deleteLocalHouseholdStoreData } from "@/lib/services/household/household-store";
import { createMockAnalytics } from "@/lib/test/mocks/analytics";
import {
	cachedSessionBootstrapFixture,
	sessionBootstrapFixture,
} from "./bootstrap.test-helpers";
import {
	createSessionCache,
	SESSION_CACHE_KEY,
	type SessionCacheStorage,
} from "./cache";

jest.mock("@/lib/analytics", () =>
	jest.requireActual("@/lib/test/mocks/analytics"),
);

jest.mock("@/lib/services/household/household-store", () => ({
	deleteLocalHouseholdStoreData: jest.fn(async () => undefined),
}));

const mockDeleteLocalHouseholdStoreData = jest.mocked(
	deleteLocalHouseholdStoreData,
);

describe("createSessionCache", () => {
	beforeEach(() => {
		jest.restoreAllMocks();
		mockDeleteLocalHouseholdStoreData.mockReset();
		mockDeleteLocalHouseholdStoreData.mockResolvedValue(undefined);
	});

	it("stores cached Authenticated App Session metadata without Household DB auth tokens", async () => {
		const storage = memoryStorage();
		const analytics = createMockAnalytics();
		jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_100);
		const cache = createSessionCache({ storage, analytics });

		const metadata = await cache.save(sessionBootstrapFixture());
		const raw = await storage.getItem(SESSION_CACHE_KEY);

		expect(raw).not.toContain("secret-household-token");
		expect(metadata.householdDatabase).toEqual({
			url: "libsql://example.turso.io",
			expiresAt: 1_700_000_000_000,
		});
		expect(metadata.initializedAt).toBe(1_700_000_000_100);
		expect(Object.hasOwn(metadata.householdDatabase, "authToken")).toBe(false);
		expect(analytics.track).toHaveBeenCalledWith(
			"authenticated_app_session_cached",
			{
				household_id: "hh_avery",
				member_role: "owner",
				member_count: 1,
			},
		);
	});

	it("deletes dropped associated Household local data when saving fresh metadata", async () => {
		const storage = memoryStorage();
		const cache = createSessionCache({ storage });
		await cache.save(
			sessionBootstrapFixture({
				householdId: "hh_new",
				householdName: "New",
				households: [
					{ id: "hh_old", name: "Old", role: "owner", isActive: false },
					{ id: "hh_new", name: "New", role: "member", isActive: true },
				],
			}),
		);
		mockDeleteLocalHouseholdStoreData.mockClear();

		await cache.save(
			sessionBootstrapFixture({
				householdId: "hh_new",
				householdName: "New",
				households: [
					{ id: "hh_new", name: "New", role: "member", isActive: true },
				],
			}),
		);

		expect(mockDeleteLocalHouseholdStoreData).toHaveBeenCalledWith("hh_old");
		expect(mockDeleteLocalHouseholdStoreData).toHaveBeenCalledTimes(1);
		await expect(storage.getItem(SESSION_CACHE_KEY)).resolves.not.toContain(
			"hh_old",
		);
	});

	it("keeps dropped associated Household local data deletion retry after fresh metadata save", async () => {
		const storage = memoryStorage();
		const cache = createSessionCache({ storage });
		await cache.save(
			sessionBootstrapFixture({
				householdId: "hh_new",
				householdName: "New",
				households: [
					{ id: "hh_old", name: "Old", role: "owner", isActive: false },
					{ id: "hh_new", name: "New", role: "member", isActive: true },
				],
			}),
		);
		mockDeleteLocalHouseholdStoreData
			.mockReset()
			.mockRejectedValueOnce(new Error("delete failed"))
			.mockResolvedValue(undefined);

		await expect(
			cache.save(
				sessionBootstrapFixture({
					householdId: "hh_new",
					householdName: "New",
					households: [
						{ id: "hh_new", name: "New", role: "member", isActive: true },
					],
				}),
			),
		).rejects.toThrow("delete failed");
		await expect(storage.getItem(SESSION_CACHE_KEY)).resolves.not.toContain(
			"hh_old",
		);

		mockDeleteLocalHouseholdStoreData.mockClear();
		await cache.clearSignedOutData();

		expect(mockDeleteLocalHouseholdStoreData).toHaveBeenCalledWith("hh_old");
		expect(mockDeleteLocalHouseholdStoreData).toHaveBeenCalledWith("hh_new");
		expect(mockDeleteLocalHouseholdStoreData).toHaveBeenCalledTimes(2);
	});

	it("reads cached Authenticated App Session metadata while stripping persisted auth tokens", async () => {
		const storage = memoryStorage();
		const analytics = createMockAnalytics();
		const cache = createSessionCache({ storage, analytics });
		const { householdDatabase: _householdDatabase, ...sessionMetadata } =
			sessionBootstrapFixture();
		await storage.setItem(
			SESSION_CACHE_KEY,
			JSON.stringify({
				...sessionMetadata,
				householdDatabase: {
					url: "libsql://example.turso.io",
					authToken: "leaked-token",
					expiresAt: 1_700_000_000_000,
				},
				initializedAt: 1_700_000_000_100,
			}),
		);

		const cached = await cache.read();

		expect(cached?.householdDatabase).toEqual({
			url: "libsql://example.turso.io",
			expiresAt: 1_700_000_000_000,
		});
		expect(Object.hasOwn(cached?.householdDatabase ?? {}, "authToken")).toBe(
			false,
		);
		expect(analytics.track).not.toHaveBeenCalled();
	});

	it("reports no unauthorized cached Authenticated App Session for matching fresh authorization without side effects", async () => {
		const storage = memoryStorage();
		const analytics = createMockAnalytics();
		const cache = createSessionCache({ storage, analytics });

		await cache.save(sessionBootstrapFixture());
		analytics.track.mockClear();
		const removeItem = jest.spyOn(storage, "removeItem");

		await expect(
			cache.readUnauthorized(sessionBootstrapFixture()),
		).resolves.toBeNull();
		expect(mockDeleteLocalHouseholdStoreData).not.toHaveBeenCalled();
		expect(removeItem).not.toHaveBeenCalled();
		expect(analytics.track).not.toHaveBeenCalled();
		await expect(storage.getItem(SESSION_CACHE_KEY)).resolves.toEqual(
			expect.any(String),
		);
	});

	it("keeps cached Household data authorized when a fresh session switches to another associated Household", async () => {
		const storage = memoryStorage();
		const analytics = createMockAnalytics();
		const cache = createSessionCache({ storage, analytics });
		const oldSession = sessionBootstrapFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const freshSession = sessionBootstrapFixture({
			householdId: "hh_new",
			householdName: "New",
			households: [
				{ id: "hh_old", name: "Old", role: "owner", isActive: false },
				{ id: "hh_new", name: "New", role: "member", isActive: true },
			],
		});

		await cache.save(oldSession);
		analytics.track.mockClear();
		const removeItem = jest.spyOn(storage, "removeItem");

		await expect(cache.readUnauthorized(freshSession)).resolves.toBeNull();
		expect(mockDeleteLocalHouseholdStoreData).not.toHaveBeenCalled();
		expect(removeItem).not.toHaveBeenCalled();
		expect(analytics.track).not.toHaveBeenCalled();
		await expect(storage.getItem(SESSION_CACHE_KEY)).resolves.toEqual(
			expect.any(String),
		);
	});

	it("reports unauthorized cached Authenticated App Session metadata without deleting local data or clearing metadata", async () => {
		const storage = memoryStorage();
		const analytics = createMockAnalytics();
		const cache = createSessionCache({ storage, analytics });
		const oldSession = sessionBootstrapFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const freshSession = sessionBootstrapFixture({
			householdId: "hh_new",
			householdName: "New",
		});

		await cache.save(oldSession);
		analytics.track.mockClear();
		const removeItem = jest.spyOn(storage, "removeItem");

		await expect(cache.readUnauthorized(freshSession)).resolves.toMatchObject({
			activeHousehold: { id: "hh_old" },
		});
		expect(mockDeleteLocalHouseholdStoreData).not.toHaveBeenCalled();
		expect(removeItem).not.toHaveBeenCalled();
		expect(analytics.track).not.toHaveBeenCalled();
		await expect(storage.getItem(SESSION_CACHE_KEY)).resolves.toEqual(
			expect.any(String),
		);
	});

	it("clears unauthorized cached Authenticated App Session metadata and tracks invalidation", async () => {
		const storage = memoryStorage();
		const analytics = createMockAnalytics();
		const cache = createSessionCache({ storage, analytics });
		const oldSession = sessionBootstrapFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const freshSession = sessionBootstrapFixture({
			householdId: "hh_new",
			householdName: "New",
		});

		const cached = await cache.save(oldSession);
		analytics.track.mockClear();
		await cache.clearUnauthorizedMetadata(cached, freshSession);

		expect(mockDeleteLocalHouseholdStoreData).not.toHaveBeenCalled();
		expect(analytics.track).toHaveBeenCalledWith(
			"authenticated_app_session_cache_invalidated",
			{
				household_id: "hh_old",
				fresh_household_id: "hh_new",
				reason: "unauthorized",
			},
		);
		await expect(storage.getItem(SESSION_CACHE_KEY)).resolves.toBeNull();
	});

	it("clears signed-out Authenticated App Session data after deleting local data", async () => {
		const storage = memoryStorage();
		const cache = createSessionCache({ storage });
		await cache.save(sessionBootstrapFixture({ householdId: "hh_old" }));

		await cache.clearSignedOutData();

		expect(mockDeleteLocalHouseholdStoreData).toHaveBeenCalledWith("hh_old");
		await expect(storage.getItem(SESSION_CACHE_KEY)).resolves.toBeNull();
	});

	it("clears all cached associated Household local data on sign out", async () => {
		const storage = memoryStorage();
		const cache = createSessionCache({ storage });
		await cache.save(
			sessionBootstrapFixture({
				householdId: "hh_new",
				householdName: "New",
				households: [
					{ id: "hh_old", name: "Old", role: "owner", isActive: false },
					{ id: "hh_new", name: "New", role: "member", isActive: true },
				],
			}),
		);

		await cache.clearSignedOutData();

		expect(mockDeleteLocalHouseholdStoreData).toHaveBeenCalledWith("hh_old");
		expect(mockDeleteLocalHouseholdStoreData).toHaveBeenCalledWith("hh_new");
		expect(mockDeleteLocalHouseholdStoreData).toHaveBeenCalledTimes(2);
		await expect(storage.getItem(SESSION_CACHE_KEY)).resolves.toBeNull();
	});

	it("clears explicitly signed-out Household local data without cached metadata", async () => {
		const storage = memoryStorage();
		const cache = createSessionCache({ storage });

		await cache.clearSignedOutData(["hh_active"]);

		expect(mockDeleteLocalHouseholdStoreData).toHaveBeenCalledWith("hh_active");
		await expect(storage.getItem(SESSION_CACHE_KEY)).resolves.toBeNull();
	});

	it("keeps a local data deletion retry when local deletion fails", async () => {
		const storage = memoryStorage();
		const cache = createSessionCache({ storage });
		await cache.save(sessionBootstrapFixture({ householdId: "hh_old" }));
		mockDeleteLocalHouseholdStoreData
			.mockRejectedValueOnce(new Error("delete failed"))
			.mockResolvedValue(undefined);

		await expect(cache.clearSignedOutData()).rejects.toThrow("delete failed");
		await expect(storage.getItem(SESSION_CACHE_KEY)).resolves.toBeNull();

		mockDeleteLocalHouseholdStoreData.mockClear();
		await cache.clearSignedOutData();

		expect(mockDeleteLocalHouseholdStoreData).toHaveBeenCalledWith("hh_old");

		mockDeleteLocalHouseholdStoreData.mockClear();
		await cache.clearSignedOutData();

		expect(mockDeleteLocalHouseholdStoreData).not.toHaveBeenCalled();
	});

	it("deletes all cached associated Household local data only through the explicit local data API", async () => {
		const cache = createSessionCache();
		const cached = cachedSessionBootstrapFixture({
			householdId: "hh_new",
			householdName: "New",
			households: [
				{ id: "hh_old", name: "Old", role: "owner", isActive: false },
				{ id: "hh_new", name: "New", role: "member", isActive: true },
			],
		});

		await cache.deleteLocalData(cached);

		expect(mockDeleteLocalHouseholdStoreData).toHaveBeenCalledWith("hh_old");
		expect(mockDeleteLocalHouseholdStoreData).toHaveBeenCalledWith("hh_new");
		expect(mockDeleteLocalHouseholdStoreData).toHaveBeenCalledTimes(2);
	});
});

function memoryStorage(): SessionCacheStorage {
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
