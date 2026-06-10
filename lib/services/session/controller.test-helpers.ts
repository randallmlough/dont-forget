import type { ItemService } from "@/lib/services/item";
import type { ListService } from "@/lib/services/list";
import type { SyncCoordinator } from "@/lib/services/sync";
import type { SessionBootstrapService } from "./bootstrap";
import {
	cachedSessionBootstrapFixture,
	sessionBootstrapFixture,
} from "./bootstrap.test-helpers";
import type { SessionCache } from "./cache";
import type { AuthenticatedAppSessionStateSnapshot } from "./controller";
import type { SessionDataServices } from "./services";

jest.mock("@/lib/analytics", () =>
	jest.requireActual("@/lib/test/mocks/analytics"),
);

jest.mock("@/lib/logger", () =>
	jest
		.requireActual<typeof import("@/lib/test/mocks/logger")>(
			"@/lib/test/mocks/logger",
		)
		.createMockLoggerModule(),
);

export { deferred, waitForAsync } from "@/lib/test/async";
export { createMockLogger as loggerFixture } from "@/lib/test/mocks/logger";
export type { SessionBootstrap, SessionBootstrapService } from "./bootstrap";
export {
	cachedSessionBootstrapFixture,
	sessionBootstrapFixture,
} from "./bootstrap.test-helpers";
export type { CachedSessionBootstrap, SessionCache } from "./cache";
export type { AuthenticatedAppSessionStateSnapshot } from "./controller";
export { createAuthenticatedAppSessionController } from "./controller";

export function collectSnapshots(controller: {
	getSnapshot: () => AuthenticatedAppSessionStateSnapshot;
	subscribe: (
		subscriber: (snapshot: AuthenticatedAppSessionStateSnapshot) => void,
	) => {
		remove: () => void;
	};
}): AuthenticatedAppSessionStateSnapshot[] {
	const snapshots = [controller.getSnapshot()];
	controller.subscribe((snapshot) => snapshots.push(snapshot));
	return snapshots;
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

	return {
		lists: overrides.lists ?? controllerListServiceBoundary(),
		items:
			overrides.items ??
			controllerItemServiceBoundary({ addItem, setItemChecked }),
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

type SessionRuntimeFixture = {
	deps: {
		bootstrap: SessionBootstrapService;
		cache: SessionCache;
	};
	bootstrap: SessionBootstrapService;
	cache: SessionCache;
};

type SessionRuntimeFixtureOverrides = Partial<SessionBootstrapService> &
	Partial<SessionCache>;

export function sessionRuntimeFixture(
	overrides: SessionRuntimeFixtureOverrides = {},
): SessionRuntimeFixture {
	const bootstrap: SessionBootstrapService = {
		getSession: jest.fn().mockResolvedValue(sessionBootstrapFixture()),
		...pickBootstrapOverrides(overrides),
	};
	const cache: SessionCache = {
		save: jest.fn().mockResolvedValue(cachedSessionBootstrapFixture()),
		read: jest.fn().mockResolvedValue(null),
		readUnauthorized: jest.fn().mockResolvedValue(null),
		clearUnauthorizedMetadata: jest.fn().mockResolvedValue(undefined),
		clearSignedOutData: jest.fn().mockResolvedValue(undefined),
		deleteLocalData: jest.fn().mockResolvedValue(undefined),
		...pickCacheOverrides(overrides),
	};

	return {
		deps: { bootstrap, cache },
		bootstrap,
		cache,
	};
}

function pickBootstrapOverrides(
	overrides: SessionRuntimeFixtureOverrides,
): Partial<SessionBootstrapService> {
	return overrides.getSession ? { getSession: overrides.getSession } : {};
}

function pickCacheOverrides(
	overrides: SessionRuntimeFixtureOverrides,
): Partial<SessionCache> {
	return {
		...(overrides.save ? { save: overrides.save } : {}),
		...(overrides.read ? { read: overrides.read } : {}),
		...(overrides.readUnauthorized
			? { readUnauthorized: overrides.readUnauthorized }
			: {}),
		...(overrides.clearUnauthorizedMetadata
			? { clearUnauthorizedMetadata: overrides.clearUnauthorizedMetadata }
			: {}),
		...(overrides.clearSignedOutData
			? { clearSignedOutData: overrides.clearSignedOutData }
			: {}),
		...(overrides.deleteLocalData
			? { deleteLocalData: overrides.deleteLocalData }
			: {}),
	};
}

function controllerListServiceBoundary(): ListService {
	return {
		createList: jest
			.fn<
				ReturnType<ListService["createList"]>,
				Parameters<ListService["createList"]>
			>()
			.mockRejectedValue(
				new Error("Controller tests must not write List data"),
			),
		getList: jest
			.fn<
				ReturnType<ListService["getList"]>,
				Parameters<ListService["getList"]>
			>()
			.mockRejectedValue(new Error("Controller tests must not read List data")),
		renameList: jest
			.fn<
				ReturnType<ListService["renameList"]>,
				Parameters<ListService["renameList"]>
			>()
			.mockRejectedValue(
				new Error("Controller tests must not write List data"),
			),
		deleteList: jest
			.fn<
				ReturnType<ListService["deleteList"]>,
				Parameters<ListService["deleteList"]>
			>()
			.mockRejectedValue(
				new Error("Controller tests must not write List data"),
			),
	};
}

function controllerItemServiceBoundary(overrides: {
	addItem: jest.Mock;
	setItemChecked: jest.Mock;
}): ItemService {
	return {
		listItems: jest
			.fn<
				ReturnType<ItemService["listItems"]>,
				Parameters<ItemService["listItems"]>
			>()
			.mockRejectedValue(new Error("Controller tests must not read Item data")),
		addItem: overrides.addItem,
		setItemChecked: overrides.setItemChecked,
	};
}
