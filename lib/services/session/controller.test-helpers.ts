import {
	cachedSessionBootstrapFixture,
	sessionBootstrapFixture,
} from "@/db/fixtures/session";
import type { SessionBootstrapService } from "./bootstrap";
import type { SessionCache } from "./cache";
import type { AuthenticatedAppSessionStateSnapshot } from "./controller";

export {
	cachedSessionBootstrapFixture,
	itemFixture,
	listFixture,
	sessionBootstrapFixture,
} from "@/db/fixtures/session";
export {
	authenticatedAppSessionFixture,
	itemServiceFixture,
	listServiceFixture,
	sessionDataServicesFixture,
	syncCoordinatorFixture,
} from "@/lib/services/session/test-fixtures";
export { deferred, waitForAsync } from "@/lib/test/async";
export { createMockLogger as loggerFixture } from "@/lib/test/mocks/logger";
export type { SessionBootstrap, SessionBootstrapService } from "./bootstrap";
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
		clearMetadata: jest.fn().mockResolvedValue(null),
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
