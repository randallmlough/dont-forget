import type {
	ActiveListInitialState,
	ActiveListSyncCoordinator,
} from "@/components/active-list";
import type {
	CachedHouseholdSession,
	HouseholdSession,
} from "@/lib/services/household";
import type { ActiveHouseholdDataServices } from "@/lib/services/household/active-household-data-services";
import type { Item, ItemService } from "@/lib/services/item";
import type { List, ListService } from "@/lib/services/list";

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

export function listFixture(overrides: Partial<List> = {}): List {
	return {
		id: "lst_default_groceries",
		householdId: "hh_avery",
		name: "Groceries",
		createdByUserId: "usr_avery",
		createdAt: 1_700_000_000_000,
		updatedAt: 1_700_000_000_000,
		...overrides,
	};
}

export function itemFixture(overrides: Partial<Item> = {}): Item {
	return {
		id: "itm_milk",
		householdId: "hh_avery",
		listId: "lst_default_groceries",
		name: "Milk",
		checked: false,
		checkedByUserId: null,
		position: 0,
		createdByUserId: "usr_avery",
		createdAt: 1_700_000_000_000,
		updatedAt: 1_700_000_000_000,
		...overrides,
	};
}

export function listServiceFixture(
	overrides: Partial<ListService> = {},
): ListService {
	return {
		getList: jest.fn().mockResolvedValue(listFixture()),
		...overrides,
	};
}

export function itemServiceFixture(
	overrides: Partial<ItemService> = {},
): ItemService {
	return {
		listItems: jest.fn().mockResolvedValue([itemFixture()]),
		addItem: jest.fn(),
		setItemChecked: jest.fn().mockResolvedValue(undefined),
		...overrides,
	};
}

export type ActiveHouseholdDataServicesFixture = ActiveHouseholdDataServices;

type ActiveHouseholdDataServicesFixtureOverrides =
	Partial<ActiveHouseholdDataServices> & {
		addItem?: jest.Mock;
		setItemChecked?: jest.Mock;
	};

export function activeHouseholdDataServicesFixture(
	overrides: ActiveHouseholdDataServicesFixtureOverrides = {},
): ActiveHouseholdDataServicesFixture {
	const addItem = overrides.addItem ?? jest.fn();
	const setItemChecked =
		overrides.setItemChecked ?? jest.fn().mockResolvedValue(undefined);
	const itemService =
		overrides.itemService ?? itemServiceFixture({ addItem, setItemChecked });

	return {
		listService: overrides.listService ?? listServiceFixture(),
		itemService,
		syncAuthorized: overrides.syncAuthorized ?? true,
		sync: overrides.sync ?? jest.fn().mockResolvedValue({ changed: false }),
		close: overrides.close ?? jest.fn().mockResolvedValue(undefined),
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
