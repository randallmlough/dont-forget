import {
	assertDatabaseResetConfirmation,
	resetDirectoryDatabase,
} from "./reset";
import {
	householdJoinCodes,
	householdJoinCodeUses,
	households,
	invitations,
	memberships,
	itemChecks as pgItemChecks,
	items as pgItems,
	lists as pgLists,
	users,
} from "./schema/postgres";
import { createTestDirectoryDb } from "./test";

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
			await directory.db.insert(pgLists).values({
				id: "lst_1",
				householdId: "hh_1",
				name: "Groceries",
				createdByUserId: "usr_1",
			});
			await directory.db.insert(pgItems).values({
				id: "itm_1",
				listId: "lst_1",
				name: "Milk",
				position: 0,
				createdByUserId: "usr_1",
			});
			await directory.db.insert(pgItemChecks).values({
				id: "ick_1",
				itemId: "itm_1",
				checkedByUserId: "usr_1",
			});

			await resetDirectoryDatabase(directory.db);

			expect(
				await directory.db.select().from(householdJoinCodeUses),
			).toHaveLength(0);
			expect(await directory.db.select().from(householdJoinCodes)).toHaveLength(
				0,
			);
			expect(await directory.db.select().from(invitations)).toHaveLength(0);
			expect(await directory.db.select().from(memberships)).toHaveLength(0);
			expect(await directory.db.select().from(pgItemChecks)).toHaveLength(0);
			expect(await directory.db.select().from(pgItems)).toHaveLength(0);
			expect(await directory.db.select().from(pgLists)).toHaveLength(0);
			expect(await directory.db.select().from(households)).toHaveLength(0);
			expect(await directory.db.select().from(users)).toHaveLength(0);
		} finally {
			await directory.close();
		}
	});
});
