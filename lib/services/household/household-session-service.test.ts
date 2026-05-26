import {
	cachedHouseholdSessionFixture,
	householdSessionFixture,
} from "@/db/fixtures/active-household";
import { BOOTSTRAP_API_PATH } from "@/lib/bootstrap";
import {
	createHouseholdSessionService,
	HOUSEHOLD_SESSION_CACHE_KEY,
	type HouseholdSessionStorage,
} from "@/lib/services/household/household-session-service";
import { deleteLocalHouseholdStoreData } from "./household-store";

jest.mock("./household-store", () => ({
	deleteLocalHouseholdStoreData: jest.fn(async () => undefined),
}));

const mockDeleteLocalHouseholdStoreData = jest.mocked(
	deleteLocalHouseholdStoreData,
);

describe("createHouseholdSessionService", () => {
	beforeEach(() => {
		jest.restoreAllMocks();
		mockDeleteLocalHouseholdStoreData.mockReset();
		mockDeleteLocalHouseholdStoreData.mockResolvedValue(undefined);
	});

	it("loads a fresh online Household Session with a Clerk session token", async () => {
		const session = householdSessionFixture();
		const analytics = analyticsFixture();
		const fetcher = jest.fn(async (_input: unknown, _init?: unknown) =>
			responseFixture(session),
		);
		const fetchForService: typeof globalThis.fetch = (input, init) =>
			fetcher(input, init);
		const service = createHouseholdSessionService({
			fetch: fetchForService,
			apiBaseUrl: () => "https://api.example.test/",
			analytics,
		});

		await expect(
			service.getHouseholdSession(async () => "session-token"),
		).resolves.toEqual(session);
		expect(fetcher).toHaveBeenCalledWith(
			`https://api.example.test${BOOTSTRAP_API_PATH}`,
			{
				method: "POST",
				headers: {
					Authorization: "Bearer session-token",
				},
			},
		);
		expect(analytics.track).toHaveBeenCalledWith("household_session_loaded", {
			household_id: "hh_avery",
			list_id: "lst_default_groceries",
			member_role: "owner",
			member_count: 1,
			source: "online",
		});
	});

	it("stores cached Household Session metadata without Household DB auth tokens", async () => {
		const storage = memoryStorage();
		const analytics = analyticsFixture();
		jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_100);
		const service = createHouseholdSessionService({
			storage,
			analytics,
		});

		const metadata = await service.saveCachedHouseholdSession(
			householdSessionFixture(),
		);
		const raw = await storage.getItem(HOUSEHOLD_SESSION_CACHE_KEY);

		expect(raw).not.toContain("secret-household-token");
		expect(metadata.householdDatabase).toEqual({
			url: "libsql://example.turso.io",
			expiresAt: 1_700_000_000_000,
		});
		expect(metadata.initializedAt).toBe(1_700_000_000_100);
		expect(Object.hasOwn(metadata.householdDatabase, "authToken")).toBe(false);
		expect(analytics.track).toHaveBeenCalledWith("household_session_cached", {
			household_id: "hh_avery",
			list_id: "lst_default_groceries",
			member_role: "owner",
			member_count: 1,
		});
	});

	it("reads cached Household Session metadata while stripping persisted auth tokens", async () => {
		const storage = memoryStorage();
		const analytics = analyticsFixture();
		const service = createHouseholdSessionService({ storage, analytics });
		const { householdDatabase: _householdDatabase, ...sessionMetadata } =
			householdSessionFixture();
		await storage.setItem(
			HOUSEHOLD_SESSION_CACHE_KEY,
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

		const cached = await service.readCachedHouseholdSession();

		expect(cached?.householdDatabase).toEqual({
			url: "libsql://example.turso.io",
			expiresAt: 1_700_000_000_000,
		});
		expect(Object.hasOwn(cached?.householdDatabase ?? {}, "authToken")).toBe(
			false,
		);
		expect(analytics.track).not.toHaveBeenCalled();
	});

	it("reports no unauthorized cached Household Session for matching fresh authorization without side effects", async () => {
		const storage = memoryStorage();
		const analytics = analyticsFixture();
		const service = createHouseholdSessionService({ storage, analytics });

		await service.saveCachedHouseholdSession(householdSessionFixture());
		analytics.track.mockClear();
		const removeItem = jest.spyOn(storage, "removeItem");

		await expect(
			service.readUnauthorizedCachedHouseholdSession(householdSessionFixture()),
		).resolves.toBeNull();
		expect(mockDeleteLocalHouseholdStoreData).not.toHaveBeenCalled();
		expect(removeItem).not.toHaveBeenCalled();
		expect(analytics.track).not.toHaveBeenCalled();
		await expect(storage.getItem(HOUSEHOLD_SESSION_CACHE_KEY)).resolves.toEqual(
			expect.any(String),
		);
	});

	it("reports unauthorized cached Household Session metadata without deleting local data or clearing metadata", async () => {
		const storage = memoryStorage();
		const analytics = analyticsFixture();
		const service = createHouseholdSessionService({ storage, analytics });
		const oldSession = householdSessionFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const freshSession = householdSessionFixture({
			householdId: "hh_new",
			householdName: "New",
		});

		await service.saveCachedHouseholdSession(oldSession);
		analytics.track.mockClear();
		const removeItem = jest.spyOn(storage, "removeItem");

		await expect(
			service.readUnauthorizedCachedHouseholdSession(freshSession),
		).resolves.toMatchObject({ activeHousehold: { id: "hh_old" } });
		expect(mockDeleteLocalHouseholdStoreData).not.toHaveBeenCalled();
		expect(removeItem).not.toHaveBeenCalled();
		expect(analytics.track).not.toHaveBeenCalled();
		await expect(storage.getItem(HOUSEHOLD_SESSION_CACHE_KEY)).resolves.toEqual(
			expect.any(String),
		);
	});

	it("clears unauthorized cached Household Session metadata and tracks invalidation", async () => {
		const storage = memoryStorage();
		const analytics = analyticsFixture();
		const service = createHouseholdSessionService({ storage, analytics });
		const oldSession = householdSessionFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const freshSession = householdSessionFixture({
			householdId: "hh_new",
			householdName: "New",
		});

		const cached = await service.saveCachedHouseholdSession(oldSession);
		analytics.track.mockClear();
		await service.clearUnauthorizedCachedHouseholdSessionMetadata(
			cached,
			freshSession,
		);

		expect(mockDeleteLocalHouseholdStoreData).not.toHaveBeenCalled();
		expect(analytics.track).toHaveBeenCalledWith(
			"household_session_cache_invalidated",
			{
				household_id: "hh_old",
				fresh_household_id: "hh_new",
				reason: "unauthorized",
			},
		);
		await expect(
			storage.getItem(HOUSEHOLD_SESSION_CACHE_KEY),
		).resolves.toBeNull();
	});

	it("clears cached Household Session metadata without deleting local Household data", async () => {
		const storage = memoryStorage();
		const analytics = analyticsFixture();
		const service = createHouseholdSessionService({ storage, analytics });

		await service.saveCachedHouseholdSession(householdSessionFixture());
		analytics.track.mockClear();
		const removed = await service.clearCachedHouseholdSessionMetadata();

		expect(removed).toMatchObject({ activeHousehold: { id: "hh_avery" } });
		expect(mockDeleteLocalHouseholdStoreData).not.toHaveBeenCalled();
		expect(analytics.track).not.toHaveBeenCalled();
		await expect(
			storage.getItem(HOUSEHOLD_SESSION_CACHE_KEY),
		).resolves.toBeNull();
	});

	it("clears signed-out Household Session data after deleting local data", async () => {
		const storage = memoryStorage();
		const service = createHouseholdSessionService({ storage });
		await service.saveCachedHouseholdSession(
			householdSessionFixture({ householdId: "hh_old" }),
		);

		await service.clearSignedOutHouseholdSessionData();

		expect(mockDeleteLocalHouseholdStoreData).toHaveBeenCalledWith("hh_old");
		await expect(
			storage.getItem(HOUSEHOLD_SESSION_CACHE_KEY),
		).resolves.toBeNull();
	});

	it("clears explicitly signed-out Household local data without cached metadata", async () => {
		const storage = memoryStorage();
		const service = createHouseholdSessionService({ storage });

		await service.clearSignedOutHouseholdSessionData(["hh_active"]);

		expect(mockDeleteLocalHouseholdStoreData).toHaveBeenCalledWith("hh_active");
		await expect(
			storage.getItem(HOUSEHOLD_SESSION_CACHE_KEY),
		).resolves.toBeNull();
	});

	it("clears signed-out Household Session metadata and keeps a local data deletion retry when local deletion fails", async () => {
		const storage = memoryStorage();
		const service = createHouseholdSessionService({ storage });
		await service.saveCachedHouseholdSession(
			householdSessionFixture({ householdId: "hh_old" }),
		);
		mockDeleteLocalHouseholdStoreData
			.mockRejectedValueOnce(new Error("delete failed"))
			.mockResolvedValue(undefined);

		await expect(service.clearSignedOutHouseholdSessionData()).rejects.toThrow(
			"delete failed",
		);

		await expect(
			storage.getItem(HOUSEHOLD_SESSION_CACHE_KEY),
		).resolves.toBeNull();

		mockDeleteLocalHouseholdStoreData.mockClear();
		await service.clearSignedOutHouseholdSessionData();

		expect(mockDeleteLocalHouseholdStoreData).toHaveBeenCalledWith("hh_old");

		mockDeleteLocalHouseholdStoreData.mockClear();
		await service.clearSignedOutHouseholdSessionData();

		expect(mockDeleteLocalHouseholdStoreData).not.toHaveBeenCalled();
	});

	it("deletes local Household data only through the explicit local data API", async () => {
		const service = createHouseholdSessionService();
		const cached = cachedHouseholdSessionFixture({ householdId: "hh_old" });

		await service.deleteCachedHouseholdSessionLocalData(cached);

		expect(mockDeleteLocalHouseholdStoreData).toHaveBeenCalledWith("hh_old");
	});
});

function memoryStorage(): HouseholdSessionStorage {
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

function analyticsFixture() {
	return {
		track: jest.fn(),
	};
}

function responseFixture(payload: unknown): Response {
	const response: Pick<Response, "json" | "ok"> = {
		ok: true,
		json: async () => payload,
	};
	return response as Response;
}
