import {
	activeListDataSourceFixture,
	householdSessionFixture,
	initialListFixture,
	syncCoordinatorFixture,
} from "@/db/fixtures/active-household";
import { deferred } from "@/lib/test/async";
import { createMockLogger } from "@/lib/test/mocks/logger";
import { createActiveHouseholdResourceManager } from "./active-household-resource-manager";

describe("createActiveHouseholdResourceManager", () => {
	it("reports deduped Household IDs across active and opening resources", async () => {
		const openingLoad = deferred<ReturnType<typeof initialListFixture>>();
		const manager = createActiveHouseholdResourceManager({
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(activeListDataSourceFixture())
				.mockReturnValueOnce(
					activeListDataSourceFixture({
						load: jest.fn(() => openingLoad.promise),
					}),
				)
				.mockReturnValueOnce(
					activeListDataSourceFixture({
						load: jest.fn(() => openingLoad.promise),
					}),
				),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(syncCoordinatorFixture()),
			logger: createMockLogger(),
		});
		const activeSession = householdSessionFixture({ householdId: "hh_active" });

		const activeOpened = await manager.openSessionResource(activeSession);
		manager.replaceActiveResource(activeOpened.resource, activeSession);

		const sameHouseholdOpening = manager.openSessionResource(activeSession);
		const nextSession = householdSessionFixture({ householdId: "hh_next" });
		const nextHouseholdOpening = manager.openSessionResource(nextSession);
		await Promise.resolve();

		expect(manager.getHouseholdIds()).toEqual(["hh_active", "hh_next"]);

		openingLoad.resolve(initialListFixture());
		await Promise.all([sameHouseholdOpening, nextHouseholdOpening]);
	});
});
