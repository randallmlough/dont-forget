import { asc, eq } from "drizzle-orm";
import {
	householdJoinCodes,
	householdJoinCodeUses,
	households,
	itemChecks,
	items,
	lists,
	memberships,
	users,
} from "@/db/schema/postgres";
import { createTestDirectoryDb } from "@/db/server/test";

describe("test database migrations", () => {
	it("applies directory and product migrations to an isolated local database", async () => {
		const directory = await createTestDirectoryDb();

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
				createdByUserId: "usr_1",
			});
			await directory.db.insert(memberships).values({
				id: "membership_1",
				householdId: "household_1",
				userId: "usr_1",
				role: "owner",
			});

			await directory.db.insert(lists).values({
				id: "list_1",
				householdId: "household_1",
				name: "Groceries",
				createdByUserId: "usr_1",
			});
			await directory.db.insert(items).values({
				id: "item_1",
				listId: "list_1",
				name: "Milk",
				quantity: "1 gallon",
				notes: "Organic if easy",
				position: 0,
				createdByUserId: "usr_1",
			});
			await directory.db.insert(itemChecks).values({
				id: "check_1",
				itemId: "item_1",
				checkedByUserId: "usr_1",
				checkedAt: new Date(1_700_000_000_000),
			});

			const directoryRows = await directory.db
				.select({
					householdId: households.id,
					role: memberships.role,
				})
				.from(households)
				.innerJoin(memberships, eq(memberships.householdId, households.id));
			const listRows = await directory.db.select().from(lists);
			const itemRows = await directory.db.select().from(items);
			const checkRows = await directory.db.select().from(itemChecks);

			expect(directoryRows).toEqual([
				{ householdId: "household_1", role: "owner" },
			]);
			expect(listRows).toMatchObject([
				{ id: "list_1", archivedAt: null, deletedAt: null },
			]);
			expect(itemRows).toMatchObject([
				{
					id: "item_1",
					listId: "list_1",
					name: "Milk",
					quantity: "1 gallon",
					notes: "Organic if easy",
				},
			]);
			expect(checkRows).toEqual([
				{
					id: "check_1",
					itemId: "item_1",
					checkedByUserId: "usr_1",
					checkedAt: new Date(1_700_000_000_000),
					updatedAt: expect.any(Date),
				},
			]);
		} finally {
			await directory.close();
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
					createdByUserId: "usr_owner",
				},
				{
					id: "hh_2",
					name: "Cedar",
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
