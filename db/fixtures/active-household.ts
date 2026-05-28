import type {
	ActiveListDataSource,
	ActiveListInitialState,
	ActiveListSyncCoordinator,
} from "@/components/active-list";
import type {
	CachedHouseholdSession,
	HouseholdSession,
} from "@/lib/services/household";

export type HouseholdSessionFixtureOverrides = {
	householdId?: string;
	householdName?: string;
	householdDatabaseAuthToken?: string;
	householdDatabaseExpiresAt?: number;
	householdDatabaseUrl?: string;
};

export type CachedHouseholdSessionFixtureOverrides =
	HouseholdSessionFixtureOverrides & {
		initializedAt?: number;
	};

export type InitialListFixtureOverrides = {
	checked?: boolean;
	checkedByMemberName?: string | null;
	householdName?: string;
	itemName?: string;
	items?: ActiveListInitialState["items"];
	listName?: string;
};

export function householdSessionFixture(
	overrides: HouseholdSessionFixtureOverrides = {},
): HouseholdSession {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
		},
		activeHousehold: {
			id: overrides.householdId ?? "hh_avery",
			name: overrides.householdName ?? "Avery",
		},
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner",
			displayName: "Avery Chen",
		},
		members: [
			{
				membershipId: "mbr_avery",
				userId: "usr_avery",
				role: "owner",
				displayName: "Avery Chen",
			},
		],
		householdDatabase: {
			url: overrides.householdDatabaseUrl ?? "libsql://example.turso.io",
			authToken:
				overrides.householdDatabaseAuthToken ?? "secret-household-token",
			expiresAt: overrides.householdDatabaseExpiresAt ?? 1_700_000_000_000,
		},
	};
}

export function cachedHouseholdSessionFixture(
	overrides: CachedHouseholdSessionFixtureOverrides = {},
): CachedHouseholdSession {
	const { householdDatabase: _householdDatabase, ...sessionMetadata } =
		householdSessionFixture(overrides);

	return {
		...sessionMetadata,
		householdDatabase: {
			url: overrides.householdDatabaseUrl ?? "libsql://example.turso.io",
			expiresAt: overrides.householdDatabaseExpiresAt ?? 1_700_000_000_000,
		},
		initializedAt: overrides.initializedAt ?? 1_700_000_000_000,
	};
}

export function initialListFixture(
	overrides: InitialListFixtureOverrides = {},
): ActiveListInitialState {
	return {
		householdName: overrides.householdName ?? "Avery",
		listName: overrides.listName ?? "Groceries",
		items: overrides.items ?? [
			{
				id: "itm_milk",
				name: overrides.itemName ?? "Milk",
				checked: overrides.checked ?? false,
				checkedByMemberName: overrides.checkedByMemberName ?? null,
			},
		],
	};
}

export function activeListDataSourceFixture(
	overrides: Partial<ActiveListDataSource> = {},
): ActiveListDataSource {
	return {
		syncAuthorized: true,
		load: jest.fn().mockResolvedValue(initialListFixture()),
		addItem: jest.fn(),
		setItemChecked: jest.fn(),
		pull: jest.fn().mockResolvedValue({ changed: false }),
		sync: jest.fn().mockResolvedValue({ changed: false }),
		close: jest.fn().mockResolvedValue(undefined),
		...overrides,
	};
}

export function syncCoordinatorFixture(): ActiveListSyncCoordinator {
	return {
		getStatus: jest.fn(() => "synced"),
		subscribe: jest.fn(() => ({ remove() {} })),
		start: jest.fn(),
		stop: jest.fn().mockResolvedValue(undefined),
		requestSync: jest.fn().mockResolvedValue(null),
	};
}
