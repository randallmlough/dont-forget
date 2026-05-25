import type { ActiveListInitialState } from "@/components/active-list";

export {
	activeListDataSourceFixture,
	cachedHouseholdSessionFixture,
	householdSessionFixture,
	initialListFixture,
	syncCoordinatorFixture,
} from "@/db/fixtures/active-household";

import {
	cachedHouseholdSessionFixture,
	householdSessionFixture,
} from "@/db/fixtures/active-household";
import type { Logger } from "@/lib/logger";

export type { ActiveHouseholdSnapshot } from "./active-household-controller";
export { createActiveHouseholdController } from "./active-household-controller";
export type {
	CachedHouseholdSession,
	HouseholdSession,
	HouseholdSessionService,
} from "./household-session-service";

import type { ActiveHouseholdSnapshot } from "./active-household-controller";
import type { HouseholdSessionService } from "./household-session-service";

export type { ActiveListInitialState };

export function collectSnapshots(controller: {
	getSnapshot: () => ActiveHouseholdSnapshot;
	subscribe: (subscriber: (snapshot: ActiveHouseholdSnapshot) => void) => {
		remove: () => void;
	};
}): ActiveHouseholdSnapshot[] {
	const snapshots = [controller.getSnapshot()];
	controller.subscribe((snapshot) => snapshots.push(snapshot));
	return snapshots;
}

export function sessionServiceFixture(
	overrides: Partial<HouseholdSessionService> = {},
): HouseholdSessionService {
	const service: HouseholdSessionService = {
		getHouseholdSession: jest.fn().mockResolvedValue(householdSessionFixture()),
		saveCachedHouseholdSession: jest
			.fn()
			.mockResolvedValue(cachedHouseholdSessionFixture()),
		readCachedHouseholdSession: jest.fn().mockResolvedValue(null),
		readUnauthorizedCachedHouseholdSession: jest.fn().mockResolvedValue(null),
		clearUnauthorizedCachedHouseholdSessionMetadata: jest
			.fn()
			.mockResolvedValue(undefined),
		clearCachedHouseholdSessionMetadata: jest.fn().mockResolvedValue(null),
		clearSignedOutHouseholdSessionData: jest.fn().mockResolvedValue(undefined),
		deleteCachedHouseholdSessionLocalData: jest
			.fn()
			.mockResolvedValue(undefined),
		...overrides,
	};

	return service;
}

export function loggerFixture(): jest.Mocked<Logger> {
	const logger = {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		with: jest.fn(),
	};
	logger.with.mockReturnValue(logger);
	return logger;
}

export async function waitForAsync(assertion: () => void) {
	for (let attempt = 0; attempt < 25; attempt += 1) {
		try {
			assertion();
			return;
		} catch (error) {
			if (attempt === 24) throw error;
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	}
}

export function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});

	return { promise, resolve, reject };
}
