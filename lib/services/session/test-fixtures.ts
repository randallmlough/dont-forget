import type { Item, ItemService } from "@/lib/services/item";
import type { List, ListService } from "@/lib/services/list";
import type { SyncCoordinator } from "@/lib/services/sync";
import type { SessionBootstrap } from "./bootstrap";
import type { CachedSessionBootstrap } from "./cache";
import type {
	AuthenticatedAppSession,
	AuthenticatedAppSessionServices,
} from "./controller";
import type { SessionDataServices } from "./services";

export type SessionBootstrapFixtureOverrides = {
	householdId?: string;
	householdName?: string;
	householdDatabaseAuthToken?: string;
	householdDatabaseExpiresAt?: number;
	householdDatabaseUrl?: string;
};

export type CachedSessionBootstrapFixtureOverrides =
	SessionBootstrapFixtureOverrides & {
		initializedAt?: number;
	};

export function sessionBootstrapFixture(
	overrides: SessionBootstrapFixtureOverrides = {},
): SessionBootstrap {
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

export function cachedSessionBootstrapFixture(
	overrides: CachedSessionBootstrapFixtureOverrides = {},
): CachedSessionBootstrap {
	const { householdDatabase: _householdDatabase, ...sessionMetadata } =
		sessionBootstrapFixture(overrides);

	return {
		...sessionMetadata,
		householdDatabase: {
			url: overrides.householdDatabaseUrl ?? "libsql://example.turso.io",
			expiresAt: overrides.householdDatabaseExpiresAt ?? 1_700_000_000_000,
		},
		initializedAt: overrides.initializedAt ?? 1_700_000_000_000,
	};
}

export function sessionListFixture(overrides: Partial<List> = {}): List {
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

export function sessionItemFixture(overrides: Partial<Item> = {}): Item {
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
		getList: jest.fn().mockResolvedValue(sessionListFixture()),
		...overrides,
	};
}

export function itemServiceFixture(
	overrides: Partial<ItemService> = {},
): ItemService {
	return {
		listItems: jest.fn().mockResolvedValue([sessionItemFixture()]),
		addItem: jest.fn(),
		setItemChecked: jest.fn().mockResolvedValue(undefined),
		...overrides,
	};
}

export type SessionDataServicesFixture = SessionDataServices;

type SessionDataServicesFixtureOverrides = Partial<SessionDataServices> & {
	addItem?: jest.Mock;
	setItemChecked?: jest.Mock;
};

export function sessionDataServicesFixture(
	overrides: SessionDataServicesFixtureOverrides = {},
): SessionDataServicesFixture {
	const addItem = overrides.addItem ?? jest.fn();
	const setItemChecked =
		overrides.setItemChecked ?? jest.fn().mockResolvedValue(undefined);
	const items =
		overrides.items ?? itemServiceFixture({ addItem, setItemChecked });

	return {
		lists: overrides.lists ?? listServiceFixture(),
		items,
		syncAuthorized: overrides.syncAuthorized ?? true,
		sync: overrides.sync ?? jest.fn().mockResolvedValue({ changed: false }),
		close: overrides.close ?? jest.fn().mockResolvedValue(undefined),
	};
}

export function syncCoordinatorFixture(): jest.Mocked<SyncCoordinator> {
	return {
		getStatus: jest.fn(() => "synced"),
		subscribe: jest.fn<
			ReturnType<SyncCoordinator["subscribe"]>,
			Parameters<SyncCoordinator["subscribe"]>
		>(() => ({ remove() {} })),
		start: jest.fn(),
		stop: jest.fn().mockResolvedValue(undefined),
		requestSync: jest
			.fn<
				ReturnType<SyncCoordinator["requestSync"]>,
				Parameters<SyncCoordinator["requestSync"]>
			>()
			.mockResolvedValue(null),
	};
}

type AuthenticatedAppSessionFixtureOverrides = {
	activeHousehold?: Partial<AuthenticatedAppSession["activeHousehold"]>;
	resourceKey?: string;
	services?: Partial<AuthenticatedAppSessionServices>;
};

export function authenticatedAppSessionFixture(
	overrides: AuthenticatedAppSessionFixtureOverrides = {},
): AuthenticatedAppSession {
	const bootstrap = sessionBootstrapFixture({
		householdId: overrides.activeHousehold?.id,
		householdName: overrides.activeHousehold?.name,
	});
	const dataServices = sessionDataServicesFixture();

	return {
		user: bootstrap.user,
		activeHousehold: bootstrap.activeHousehold,
		activeMember: bootstrap.activeMember,
		members: bootstrap.members,
		resourceKey: overrides.resourceKey ?? "authenticated-app-session:1",
		services: {
			lists: overrides.services?.lists ?? dataServices.lists,
			items: overrides.services?.items ?? dataServices.items,
			sync: overrides.services?.sync ?? syncCoordinatorFixture(),
		},
	};
}
