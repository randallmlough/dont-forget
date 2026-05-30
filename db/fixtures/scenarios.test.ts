import {
	householdJoinCodeAttempts,
	householdJoinCodes,
	householdJoinCodeUses,
	households,
	memberships,
	users,
} from "@/db/schema/directory";
import { createTestDirectoryDb, createTestHouseholdDb } from "@/db/test";
import {
	householdFixture,
	householdJoinCodeAttemptFixture,
	householdJoinCodeFixture,
	householdJoinCodeUseFixture,
	membershipFixture,
	PRIMARY_HOUSEHOLD_SEED,
	seedMultiHouseholdUserScenario,
	seedPrimaryHouseholdScenario,
	userFixture,
} from "./index";

describe("database fixture scenarios", () => {
	it("inserts Join Code builder rows into a migrated directory DB", async () => {
		const directory = await createTestDirectoryDb();

		try {
			const avery = userFixture();
			const blake = userFixture({
				...PRIMARY_HOUSEHOLD_SEED.users.blake,
			});
			const household = householdFixture();
			const averyMembership = membershipFixture();
			const blakeMembership = membershipFixture({
				id: PRIMARY_HOUSEHOLD_SEED.memberships.blake.id,
				userId: blake.id,
				role: "member",
			});
			const joinCode = householdJoinCodeFixture();
			const use = householdJoinCodeUseFixture();
			const attempt = householdJoinCodeAttemptFixture();

			await directory.db.insert(users).values([avery, blake]);
			await directory.db.insert(households).values(household);
			await directory.db
				.insert(memberships)
				.values([averyMembership, blakeMembership]);
			await directory.db.insert(householdJoinCodes).values(joinCode);
			await directory.db.insert(householdJoinCodeUses).values(use);
			await directory.db.insert(householdJoinCodeAttempts).values(attempt);

			expect(await directory.db.select().from(householdJoinCodes)).toEqual([
				expect.objectContaining({
					id: joinCode.id,
					code: joinCode.code,
					disabledAt: null,
					replacedAt: null,
				}),
			]);
			expect(await directory.db.select().from(householdJoinCodeUses)).toEqual([
				expect.objectContaining({
					id: use.id,
					householdJoinCodeId: joinCode.id,
					userId: blake.id,
				}),
			]);
			expect(
				await directory.db.select().from(householdJoinCodeAttempts),
			).toEqual([
				expect.objectContaining({
					userId: blake.id,
					failedCount: 1,
				}),
			]);
		} finally {
			await directory.close();
		}
	});

	it("seeds a primary Household with active User selection and a Join Code", async () => {
		const directory = await createTestDirectoryDb();
		const household = await createTestHouseholdDb();

		try {
			const scenario = await seedPrimaryHouseholdScenario({
				directory: directory.db,
				household: household.db,
			});

			expect(scenario.users.avery.activeHouseholdId).toBe(
				scenario.household.id,
			);
			expect(scenario.users.blake.activeHouseholdId).toBe(
				scenario.household.id,
			);
			expect(await directory.db.select().from(householdJoinCodes)).toEqual([
				expect.objectContaining({
					id: scenario.joinCodes.active.id,
					householdId: scenario.household.id,
				}),
			]);
		} finally {
			await household.close();
			await directory.close();
		}
	});

	it("seeds a multi-Household User scenario", async () => {
		const directory = await createTestDirectoryDb();

		try {
			const scenario = await seedMultiHouseholdUserScenario({
				directory: directory.db,
			});

			expect(scenario.users.avery.activeHouseholdId).toBe(
				scenario.households.second.id,
			);
			expect(await directory.db.select().from(households)).toHaveLength(2);
			expect(await directory.db.select().from(memberships)).toHaveLength(3);
			expect(await directory.db.select().from(householdJoinCodes)).toHaveLength(
				2,
			);
		} finally {
			await directory.close();
		}
	});
});
