import { BOOTSTRAP_API_PATH } from "@/lib/bootstrap";
import {
	createHouseholdSessionService,
	HOUSEHOLD_SESSION_CACHE_KEY,
	type HouseholdSession,
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

	it("discards cached Household Session metadata and local data when fresh session authorizes a different Household", async () => {
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

		await expect(
			service.discardCachedHouseholdSessionIfUnauthorized(freshSession),
		).resolves.toMatchObject({ activeHousehold: { id: "hh_old" } });
		expect(mockDeleteLocalHouseholdStoreData).toHaveBeenCalledWith("hh_old");
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

	it("clears cached Household Session metadata and local Household data for sign-out cleanup", async () => {
		const storage = memoryStorage();
		const analytics = analyticsFixture();
		const service = createHouseholdSessionService({ storage, analytics });

		await service.saveCachedHouseholdSession(householdSessionFixture());
		analytics.track.mockClear();
		await service.clearCachedHouseholdSession();

		expect(mockDeleteLocalHouseholdStoreData).toHaveBeenCalledWith("hh_avery");
		expect(analytics.track).not.toHaveBeenCalled();
		await expect(
			storage.getItem(HOUSEHOLD_SESSION_CACHE_KEY),
		).resolves.toBeNull();
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
	return {
		ok: true,
		json: async () => payload,
	} as Response;
}

function householdSessionFixture(
	overrides: { householdId?: string; householdName?: string } = {},
): HouseholdSession {
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
