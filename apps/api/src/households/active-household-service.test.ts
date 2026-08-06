import { seedMultiHouseholdUserScenario } from "@dont-forget/db/fixtures";
import { memberships, users } from "@dont-forget/db/schema";
import { createTestDirectoryDb } from "@dont-forget/db/test";
import { eq } from "drizzle-orm";
import {
	ActiveHouseholdMembershipRequiredError,
	createActiveHouseholdService,
} from "./active-household-service";

describe("createActiveHouseholdService", () => {
	it("repairs an invalid active Household with the oldest active Membership", async () => {
		const directory = await createTestDirectoryDb();
		const analytics = { track: jest.fn() };

		try {
			const scenario = await seedMultiHouseholdUserScenario({
				directory: directory.db,
			});
			await directory.db
				.update(users)
				.set({ activeHouseholdId: scenario.households.primary.id })
				.where(eq(users.id, scenario.users.avery.id));
			await directory.db
				.update(memberships)
				.set({ removedAt: 1_700_000_000_500 })
				.where(eq(memberships.id, scenario.memberships.primaryOwner.id));

			const service = createActiveHouseholdService({
				directory: directory.db,
				analytics,
			});
			const active = await service.getActiveHousehold(scenario.users.avery.id);

			expect(active).toMatchObject({
				householdId: scenario.households.second.id,
				membershipId: scenario.memberships.secondOwner.id,
			});
			const [user] = await directory.db
				.select()
				.from(users)
				.where(eq(users.id, scenario.users.avery.id));
			expect(user?.activeHouseholdId).toBe(scenario.households.second.id);
			expect(analytics.track).not.toHaveBeenCalled();
		} finally {
			await directory.close();
		}
	});

	it("switches only to a Household where the User is an active Member", async () => {
		const directory = await createTestDirectoryDb();
		const analytics = { track: jest.fn() };

		try {
			const scenario = await seedMultiHouseholdUserScenario({
				directory: directory.db,
			});
			const service = createActiveHouseholdService({
				directory: directory.db,
				analytics,
			});

			await expect(
				service.switchActiveHousehold({
					userId: scenario.users.blake.id,
					householdId: scenario.households.primary.id,
				}),
			).rejects.toBeInstanceOf(ActiveHouseholdMembershipRequiredError);

			const switched = await service.switchActiveHousehold({
				userId: scenario.users.avery.id,
				householdId: scenario.households.primary.id,
			});
			const associated = await service.listAssociatedHouseholds(
				scenario.users.avery.id,
			);

			expect(switched).toMatchObject({
				householdId: scenario.households.primary.id,
				membershipId: scenario.memberships.primaryOwner.id,
			});
			expect(associated).toEqual([
				{
					householdId: scenario.households.primary.id,
					householdName: scenario.households.primary.name,
					membershipRole: "owner",
					isActive: true,
				},
				{
					householdId: scenario.households.second.id,
					householdName: scenario.households.second.name,
					membershipRole: "owner",
					isActive: false,
				},
			]);
			expect(analytics.track).toHaveBeenCalledWith("household_switched", {
				household_id: scenario.households.primary.id,
				user_id: scenario.users.avery.id,
			});
		} finally {
			await directory.close();
		}
	});
});
