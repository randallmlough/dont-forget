import {
	itemFixture,
	listFixture,
	sessionBootstrapFixture,
} from "@/db/fixtures/session";
import type { ItemService } from "@/lib/services/item";
import type { ListService } from "@/lib/services/list";
import type { SyncCoordinator } from "@/lib/services/sync";
import type {
	AuthenticatedAppSession,
	AuthenticatedAppSessionServices,
} from "./controller";
import type { SessionDataServices } from "./services";

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
		ready: overrides.ready ?? Promise.resolve(),
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
