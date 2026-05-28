import type { ActiveListInitialState } from "@/components/active-list";
import {
	cachedSessionBootstrapFixture,
	sessionBootstrapFixture,
} from "@/db/fixtures/session";
import type {
	SessionBootstrapService,
	SessionCache,
} from "@/lib/services/session";
import type { AuthenticatedAppSessionStateSnapshot } from "./controller";

export {
	cachedSessionBootstrapFixture,
	initialListFixture,
	itemFixture,
	itemServiceFixture,
	listFixture,
	listServiceFixture,
	sessionBootstrapFixture,
	sessionDataServicesFixture,
	syncCoordinatorFixture,
} from "@/db/fixtures/session";
export type {
	CachedSessionBootstrap,
	SessionBootstrap,
	SessionBootstrapService,
	SessionCache,
} from "@/lib/services/session";
export { deferred, waitForAsync } from "@/lib/test/async";
export { createMockLogger as loggerFixture } from "@/lib/test/mocks/logger";
export type { AuthenticatedAppSessionStateSnapshot } from "./controller";
export { createAuthenticatedAppSessionController } from "./controller";

export type { ActiveListInitialState };

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

type SessionRuntimeFixture = {
	bootstrap: SessionBootstrapService;
	cache: SessionCache;
} & SessionBootstrapService &
	SessionCache;

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
		clearMetadata: jest.fn().mockResolvedValue(null),
		clearSignedOutData: jest.fn().mockResolvedValue(undefined),
		deleteLocalData: jest.fn().mockResolvedValue(undefined),
		...pickCacheOverrides(overrides),
	};

	return Object.assign({ bootstrap, cache }, bootstrap, cache);
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
		...(overrides.clearMetadata
			? { clearMetadata: overrides.clearMetadata }
			: {}),
		...(overrides.clearSignedOutData
			? { clearSignedOutData: overrides.clearSignedOutData }
			: {}),
		...(overrides.deleteLocalData
			? { deleteLocalData: overrides.deleteLocalData }
			: {}),
	};
}
