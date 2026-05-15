import { eq } from "drizzle-orm";

import { memberships, households, users } from "@/db/schema/directory";
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
        createdByClerkUserId: "clerk_user_1",
        createdByUserId: "usr_1",
      });
      await directory.db.insert(memberships).values({
        id: "membership_1",
        householdId: "household_1",
        clerkUserId: "clerk_user_1",
        userId: "usr_1",
        role: "owner",
      });

      await household.db.insert(lists).values({
        id: "list_1",
        name: "Groceries",
        createdByClerkUserId: "clerk_user_1",
        createdByUserId: "usr_1",
      });
      await household.db.insert(items).values({
        id: "item_1",
        listId: "list_1",
        name: "Milk",
        position: 0,
        createdByClerkUserId: "clerk_user_1",
        createdByUserId: "usr_1",
      });
      await household.db.insert(itemChecks).values({
        itemId: "item_1",
        clerkUserId: "clerk_user_1",
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

      expect(directoryRows).toEqual([{ householdId: "household_1", role: "owner" }]);
      expect(itemRows).toMatchObject([{ id: "item_1", listId: "list_1", name: "Milk" }]);
      expect(checkRows).toEqual([
        {
          itemId: "item_1",
          clerkUserId: "clerk_user_1",
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
});
