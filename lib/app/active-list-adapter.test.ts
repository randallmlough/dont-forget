import { itemChecks, lists } from "@/db/schema/household";
import { createTestHouseholdDb } from "@/db/test";
import { DEFAULT_LIST_ID, DEFAULT_LIST_NAME } from "@/lib/bootstrap";
import { createHouseholdActiveListAdapter } from "@/lib/app/active-list-adapter";

describe("createHouseholdActiveListAdapter", () => {
  it("requests a remote push after local Item mutations", async () => {
    const push = jest.fn(async () => undefined);
    const adapter = createHouseholdActiveListAdapter(
      adapterConfigFixture(),
      {
        db: {
          execute: jest.fn(async (statement) => {
            const sql = typeof statement === "string" ? statement : statement.sql;
            return sql.includes("MAX(position)") ? { rows: [{ position: 0 }] } : { rows: [] };
          }),
          push,
          close: jest.fn(async () => undefined),
        },
        now: () => 1_700_000_000_000,
        randomUuid: () => "uuid-1",
      },
    );

    await adapter.addItem("Milk");
    await adapter.setItemChecked("itm_uuid-1", true);

    expect(push).toHaveBeenCalledTimes(2);
  });

  it("keeps local Item mutations successful when push fails", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const push = jest.fn(async () => {
      throw new Error("offline");
    });
    const adapter = createHouseholdActiveListAdapter(
      adapterConfigFixture(),
      {
        db: {
          execute: jest.fn(async (statement) => {
            const sql = typeof statement === "string" ? statement : statement.sql;
            return sql.includes("MAX(position)") ? { rows: [{ position: 0 }] } : { rows: [] };
          }),
          push,
          close: jest.fn(async () => undefined),
        },
        now: () => 1_700_000_000_000,
        randomUuid: () => "uuid-1",
      },
    );

    try {
      await expect(adapter.addItem("Milk")).resolves.toEqual({
        id: "itm_uuid-1",
        name: "Milk",
        checked: false,
        checkedByMemberName: null,
      });
      await Promise.resolve();

      expect(push).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

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

      const adapter = createHouseholdActiveListAdapter(
        {
          household: { id: "hh_avery", name: "Avery" },
          list: { id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME },
          currentUser: {
            id: "usr_avery",
            email: "avery@example.com",
            displayName: "Avery Chen",
          },
          members: [
            {
              membershipId: "mbr_avery",
              userId: "usr_avery",
              role: "owner",
              displayName: "Avery Chen",
            },
            {
              membershipId: "mbr_blake",
              userId: "usr_blake",
              role: "member",
              displayName: "Blake",
            },
          ],
          database: { url: `file:${household.path}`, authToken: "unused", expiresAt: now + 1 },
        },
        {
          db: household.client,
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

function adapterConfigFixture() {
  return {
    household: { id: "hh_avery", name: "Avery" },
    list: { id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME },
    currentUser: {
      id: "usr_avery",
      email: "avery@example.com",
      displayName: "Avery Chen",
    },
    members: [
      {
        membershipId: "mbr_avery",
        userId: "usr_avery",
        role: "owner" as const,
        displayName: "Avery Chen",
      },
    ],
    database: { url: "libsql://example.turso.io", authToken: "token", expiresAt: 1 },
  };
}
