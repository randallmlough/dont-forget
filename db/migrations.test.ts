import { asc, eq } from "drizzle-orm";

import {
	householdJoinCodeAttempts,
	householdJoinCodes,
	householdJoinCodeUses,
	households,
	memberships,
	users,
} from "@/db/schema/directory";
import { itemChecks, items, lists } from "@/db/schema/household";
import { createTestDirectoryDb, createTestHouseholdDb } from "@/db/test";

describe("test database migrations", () => {
	it("applies directory and Household migrations to isolated local databases", async () => {
		const directory = await createTestDirectoryDb();
		const household = await createTestHouseholdDb();

		try {
			await directory.db.insert(users).values({
				id: "usr_1",
				clerkUserId: "clerk_user_1",
				email: "avery@example.com",
				firstName: "Avery",
				lastName: "Chen",
				displayName: "Avery Chen",
			});
			await directory.db.insert(households).values({
				id: "household_1",
				name: "Test Household",
				tursoDbName: "test-household",
				createdByUserId: "usr_1",
			});
			await directory.db.insert(memberships).values({
				id: "membership_1",
				householdId: "household_1",
				userId: "usr_1",
				role: "owner",
			});

			await household.db.insert(lists).values({
				id: "list_1",
				name: "Groceries",
				createdByUserId: "usr_1",
			});
			await household.db.insert(items).values({
				id: "item_1",
				listId: "list_1",
				name: "Milk",
				position: 0,
				createdByUserId: "usr_1",
			});
			await household.db.insert(itemChecks).values({
				itemId: "item_1",
				userId: "usr_1",
				checkedAt: 1_700_000_000_000,
			});

			const directoryRows = await directory.db
				.select({
					householdId: households.id,
					role: memberships.role,
				})
				.from(households)
				.innerJoin(memberships, eq(memberships.householdId, households.id));
			const itemRows = await household.db.select().from(items);
			const checkRows = await household.db.select().from(itemChecks);

			expect(directoryRows).toEqual([
				{ householdId: "household_1", role: "owner" },
			]);
			expect(itemRows).toMatchObject([
				{ id: "item_1", listId: "list_1", name: "Milk" },
			]);
			expect(checkRows).toEqual([
				{
					itemId: "item_1",
					userId: "usr_1",
					checkedAt: 1_700_000_000_000,
					updatedAt: expect.any(Number),
				},
			]);
		} finally {
			await directory.close();
			await household.close();
		}
	});

	it("enforces Stage 2 directory schema constraints", async () => {
		const directory = await createTestDirectoryDb();

		try {
			await directory.db.insert(users).values([
				{
					id: "usr_owner",
					clerkUserId: "clerk_owner",
					email: "owner@example.com",
				},
				{
					id: "usr_member_1",
					clerkUserId: "clerk_member_1",
					email: "member-1@example.com",
				},
				{
					id: "usr_member_2",
					clerkUserId: "clerk_member_2",
					email: "member-2@example.com",
				},
			]);
			await directory.db.insert(households).values([
				{
					id: "hh_1",
					name: "Avery",
					tursoDbName: "df-test-hh-1",
					createdByUserId: "usr_owner",
				},
				{
					id: "hh_2",
					name: "Cedar",
					tursoDbName: "df-test-hh-2",
					createdByUserId: "usr_owner",
				},
			]);
			await directory.db.insert(memberships).values([
				{
					id: "mbr_owner_1",
					householdId: "hh_1",
					userId: "usr_owner",
					role: "owner",
				},
				{
					id: "mbr_owner_2",
					householdId: "hh_2",
					userId: "usr_owner",
					role: "owner",
				},
				{
					id: "mbr_member_1",
					householdId: "hh_1",
					userId: "usr_member_1",
					role: "member",
				},
				{
					id: "mbr_member_2",
					householdId: "hh_1",
					userId: "usr_member_2",
					role: "member",
				},
			]);

			await directory.db
				.update(users)
				.set({ activeHouseholdId: "hh_2" })
				.where(eq(users.id, "usr_owner"));

			await expect(
				directory.db.insert(memberships).values({
					id: "mbr_owner_1_duplicate",
					householdId: "hh_1",
					userId: "usr_owner",
					role: "member",
				}),
			).rejects.toThrow();

			await directory.db.insert(householdJoinCodes).values({
				id: "hjc_active",
				householdId: "hh_1",
				code: "ABCDEFGH",
				createdByUserId: "usr_owner",
			});
			await expect(
				directory.db.insert(householdJoinCodes).values({
					id: "hjc_duplicate_code",
					householdId: "hh_2",
					code: "ABCDEFGH",
					createdByUserId: "usr_owner",
				}),
			).rejects.toThrow();
			await expect(
				directory.db.insert(householdJoinCodes).values({
					id: "hjc_second_active",
					householdId: "hh_1",
					code: "HJKLMNPQ",
					createdByUserId: "usr_owner",
				}),
			).rejects.toThrow();
			await directory.db.insert(householdJoinCodes).values([
				{
					id: "hjc_replaced",
					householdId: "hh_1",
					code: "RSTUVWXY",
					createdByUserId: "usr_owner",
					replacedAt: 1_700_000_000_000,
					replacedByUserId: "usr_owner",
				},
				{
					id: "hjc_disabled",
					householdId: "hh_1",
					code: "23456789",
					createdByUserId: "usr_owner",
					disabledAt: 1_700_000_000_100,
					disabledByUserId: "usr_owner",
				},
			]);

			await directory.db.insert(householdJoinCodeUses).values([
				{
					id: "hjcu_member_1",
					householdJoinCodeId: "hjc_active",
					householdId: "hh_1",
					userId: "usr_member_1",
					membershipId: "mbr_member_1",
				},
				{
					id: "hjcu_member_2",
					householdJoinCodeId: "hjc_active",
					householdId: "hh_1",
					userId: "usr_member_2",
					membershipId: "mbr_member_2",
				},
			]);
			await directory.db.insert(householdJoinCodeAttempts).values({
				userId: "usr_member_1",
				failedCount: 1,
				windowStartedAt: 1_700_000_000_000,
				lastFailedAt: 1_700_000_000_000,
			});
			await expect(
				directory.db.insert(householdJoinCodeAttempts).values({
					userId: "usr_member_1",
					failedCount: 2,
					windowStartedAt: 1_700_000_000_000,
					lastFailedAt: 1_700_000_000_100,
				}),
			).rejects.toThrow();

			const [owner] = await directory.db
				.select({ activeHouseholdId: users.activeHouseholdId })
				.from(users)
				.where(eq(users.id, "usr_owner"));
			const ownerMemberships = await directory.db
				.select({ householdId: memberships.householdId })
				.from(memberships)
				.where(eq(memberships.userId, "usr_owner"))
				.orderBy(asc(memberships.householdId));
			const useRows = await directory.db.select().from(householdJoinCodeUses);

			expect(owner.activeHouseholdId).toBe("hh_2");
			expect(ownerMemberships).toEqual([
				{ householdId: "hh_1" },
				{ householdId: "hh_2" },
			]);
			expect(useRows).toHaveLength(2);
			expect(useRows[0]).not.toHaveProperty("code");
		} finally {
			await directory.close();
		}
	});
});
