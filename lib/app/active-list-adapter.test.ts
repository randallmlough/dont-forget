import { itemChecks, lists } from "@/db/schema/household";
import { createTestHouseholdDb } from "@/db/test";
import { DEFAULT_LIST_ID, DEFAULT_LIST_NAME } from "@/lib/bootstrap";
import { createRemoteActiveListAdapter } from "@/lib/app/active-list-adapter";

describe("createRemoteActiveListAdapter", () => {
  it("loads, appends, and persists latest-check-wins Item state", async () => {
    const household = await createTestHouseholdDb();
    let uuid = 0;
    let now = 1_700_000_000_000;

    try {
      await household.db.insert(lists).values({
        id: DEFAULT_LIST_ID,
        name: DEFAULT_LIST_NAME,
        createdByUserId: "usr_avery",
      });

      const adapter = createRemoteActiveListAdapter(
        {
          household: { id: "hh_avery", name: "Avery" },
          list: { id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME },
          currentUser: {
            id: "usr_avery",
            clerkUserId: "clerk_avery",
            email: "avery@example.com",
            firstName: "Avery",
            lastName: "Chen",
            displayName: "Avery Chen",
          },
          members: [
            { membershipId: "mbr_avery", userId: "usr_avery", role: "owner", displayName: "Avery Chen" },
            { membershipId: "mbr_blake", userId: "usr_blake", role: "member", displayName: "Blake" },
          ],
          database: { url: `file:${household.path}`, authToken: "unused", expiresAt: now + 1 },
        },
        {
          client: household.client,
          now: () => now++,
          randomUuid: () => `uuid-${++uuid}`,
        },
      );

      const milk = await adapter.addItem("Milk");
      const eggs = await adapter.addItem("Eggs");

      expect(await adapter.load()).toEqual({
        householdName: "Avery",
        listName: "Groceries",
        items: [
          { id: milk.id, name: "Milk", checked: false, checkedByMemberName: null },
          { id: eggs.id, name: "Eggs", checked: false, checkedByMemberName: null },
        ],
      });

      await adapter.setItemChecked(milk.id, true);
      expect((await adapter.load()).items[0]).toEqual({
        id: milk.id,
        name: "Milk",
        checked: true,
        checkedByMemberName: "Avery Chen",
      });

      await household.db.insert(itemChecks).values({
        itemId: milk.id,
        userId: "usr_blake",
        checkedAt: null,
        updatedAt: now + 100,
      });

      expect((await adapter.load()).items[0]).toEqual({
        id: milk.id,
        name: "Milk",
        checked: false,
        checkedByMemberName: null,
      });
    } finally {
      await household.close();
    }
  });
});
