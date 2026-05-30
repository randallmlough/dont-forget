import {
	householdJoinCodeAttempts,
	householdJoinCodes,
	householdJoinCodeUses,
	households,
	invitations,
	memberships,
	users,
} from "@/db/schema/directory";
import { itemChecks, items, lists } from "@/db/schema/household";
import { createTestDirectoryDb, createTestHouseholdDb } from "@/db/test";
import {
	assertDatabaseResetConfirmation,
	householdDatabasesForReset,
	resetDirectoryDatabase,
	resetHouseholdDatabase,
} from "./reset";

describe("database reset", () => {
	it("requires an environment-specific reset confirmation", () => {
		expect(() => assertDatabaseResetConfirmation("local", {})).toThrow(
			"CONFIRM_DB_RESET=local",
		);
		expect(() =>
			assertDatabaseResetConfirmation("local", { CONFIRM_DB_RESET: "local" }),
		).not.toThrow();
	});

	it("deletes all directory app data", async () => {
		const directory = await createTestDirectoryDb();

		try {
			await directory.db.insert(users).values({
				id: "usr_1",
				clerkUserId: "clerk_user_1",
				email: "avery@example.com",
			});
			await directory.db.insert(households).values({
				id: "hh_1",
				name: "Avery",
				tursoDbName: "df-test-hh-1",
				createdByUserId: "usr_1",
			});
			await directory.db.update(users).set({ activeHouseholdId: "hh_1" });
			await directory.db.insert(memberships).values({
				id: "mbr_1",
				householdId: "hh_1",
				userId: "usr_1",
				role: "owner",
			});
			await directory.db.insert(invitations).values({
				id: "inv_1",
				householdId: "hh_1",
				token: "token-1",
				createdByUserId: "usr_1",
				expiresAt: 1_700_000_000_000,
			});
			await directory.db.insert(householdJoinCodes).values({
				id: "hjc_1",
				householdId: "hh_1",
				code: "ABCDEFGH",
				createdByUserId: "usr_1",
			});
			await directory.db.insert(householdJoinCodeUses).values({
				id: "hjcu_1",
				householdJoinCodeId: "hjc_1",
				householdId: "hh_1",
				userId: "usr_1",
				membershipId: "mbr_1",
			});
			await directory.db.insert(householdJoinCodeAttempts).values({
				userId: "usr_1",
				failedCount: 1,
				windowStartedAt: 1_700_000_000_000,
				lastFailedAt: 1_700_000_000_000,
			});

			expect(await householdDatabasesForReset(directory.db)).toEqual([
				{ id: "hh_1", tursoDbName: "df-test-hh-1" },
			]);

			await resetDirectoryDatabase(directory.db);

			expect(
				await directory.db.select().from(householdJoinCodeUses),
			).toHaveLength(0);
			expect(
				await directory.db.select().from(householdJoinCodeAttempts),
			).toHaveLength(0);
			expect(await directory.db.select().from(householdJoinCodes)).toHaveLength(
				0,
			);
			expect(await directory.db.select().from(invitations)).toHaveLength(0);
			expect(await directory.db.select().from(memberships)).toHaveLength(0);
			expect(await directory.db.select().from(households)).toHaveLength(0);
			expect(await directory.db.select().from(users)).toHaveLength(0);
		} finally {
			await directory.close();
		}
	});

	it("deletes all Household app data", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values({
				id: "lst_1",
				name: "Groceries",
				createdByUserId: "usr_1",
			});
			await household.db.insert(items).values({
				id: "itm_1",
				listId: "lst_1",
				name: "Milk",
				position: 0,
				createdByUserId: "usr_1",
			});
			await household.db.insert(itemChecks).values({
				itemId: "itm_1",
				userId: "usr_1",
				checkedAt: 1_700_000_000_000,
			});

			await resetHouseholdDatabase(household.db);

			expect(await household.db.select().from(itemChecks)).toHaveLength(0);
			expect(await household.db.select().from(items)).toHaveLength(0);
			expect(await household.db.select().from(lists)).toHaveLength(0);
		} finally {
			await household.close();
		}
	});
});
