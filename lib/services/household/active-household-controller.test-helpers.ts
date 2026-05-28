import type { ActiveListInitialState } from "@/components/active-list";
import {
	cachedHouseholdSessionFixture,
	householdSessionFixture,
} from "@/db/fixtures/active-household";
import type { ActiveHouseholdSnapshot } from "./active-household-controller";
import type { HouseholdSessionService } from "./household-session-service";

export {
	activeHouseholdDataServicesFixture,
	cachedHouseholdSessionFixture,
	householdSessionFixture,
	initialListFixture,
	itemFixture,
	itemServiceFixture,
	listFixture,
	listServiceFixture,
	syncCoordinatorFixture,
} from "@/db/fixtures/active-household";
export { deferred, waitForAsync } from "@/lib/test/async";
export { createMockLogger as loggerFixture } from "@/lib/test/mocks/logger";

export type { ActiveHouseholdSnapshot } from "./active-household-controller";
export { createActiveHouseholdController } from "./active-household-controller";
export type {
	CachedHouseholdSession,
	HouseholdSession,
	HouseholdSessionService,
} from "./household-session-service";

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
