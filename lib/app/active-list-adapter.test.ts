import { itemChecks, lists } from "@/db/schema/household";
import { createTestHouseholdDb } from "@/db/test";
import { DEFAULT_LIST_ID, DEFAULT_LIST_NAME } from "@/lib/bootstrap";
import { createHouseholdActiveListAdapter } from "@/lib/app/active-list-adapter";
import type { HouseholdSqlStatement } from "@/lib/app/household-db";

describe("createHouseholdActiveListAdapter", () => {
  it("exposes explicit app-owned pull and sync operations", async () => {
    const pull = jest.fn(async () => ({ changed: true }));
    const sync = jest.fn(async () => ({ changed: false }));
    const adapter = createHouseholdActiveListAdapter(
      adapterConfigFixture(),
      {
        db: {
          syncAuthorized: true,
          execute: jest.fn(async () => ({ rows: [] })),
          pull,
          sync,
          close: jest.fn(async () => undefined),
        },
      },
    );

    expect(adapter.syncAuthorized).toBe(true);
    await expect(adapter.pull()).resolves.toEqual({ changed: true });
    await expect(adapter.sync()).resolves.toEqual({ changed: false });
    expect(pull).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("uses monotonic app-generated timestamps for local Item writes", async () => {
    let uuid = 0;
    const rawTimestamps = [1_700_000_000_000, 1_699_999_999_999, 1_699_999_999_999];
    const execute = jest.fn(async (statement: HouseholdSqlStatement) => {
      const sql = statementSql(statement);
      return sql.includes("MAX(position)") ? { rows: [{ position: 0 }] } : { rows: [] };
    });
    const adapter = createHouseholdActiveListAdapter(
      adapterConfigFixture(),
      {
        db: {
          execute,
          close: jest.fn(async () => undefined),
        },
        now: () => rawTimestamps.shift() ?? 1_699_999_999_999,
        randomUuid: () => `uuid-${++uuid}`,
      },
    );

    const milk = await adapter.addItem("Milk");
    await adapter.addItem("Eggs");
    await adapter.setItemChecked(milk.id, true);

    const itemWrites = execute.mock.calls
      .map(([statement]) => statement)
      .filter((statement) => statementSql(statement).includes("INSERT INTO items"));
    const checkWrite = execute.mock.calls
      .map(([statement]) => statement)
      .find((statement) => statementSql(statement).includes("INSERT INTO item_checks"));

    expect(statementArgs(itemWrites[0]).slice(-2)).toEqual([1_700_000_000_000, 1_700_000_000_000]);
    expect(statementArgs(itemWrites[1]).slice(-2)).toEqual([1_700_000_000_001, 1_700_000_000_001]);
    expect(statementArgs(checkWrite)).toEqual([milk.id, "usr_avery", 1_700_000_000_002, 1_700_000_000_002]);
  });

  it("loads, appends, and persists latest-check-wins Item state", async () => {
    const household = await createTestHouseholdDb();
    let uuid = 0;
    let now = 1_700_000_000_000;

    try {
      await household.db.insert(lists).values({
        id: DEFAULT_LIST_ID,
        name: "Weekend Groceries",
        createdByUserId: "usr_avery",
      });

      const adapter = createHouseholdActiveListAdapter(
        {
          household: { id: "hh_avery", name: "Avery" },
          activeMember: {
            id: "mbr_avery",
            userId: "usr_avery",
            role: "owner",
            displayName: "Avery Chen",
          },
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
          db: {
            execute: household.client.execute.bind(household.client),
            close: jest.fn(async () => undefined),
          },
          now: () => now++,
          randomUuid: () => `uuid-${++uuid}`,
        },
      );

      const milk = await adapter.addItem("Milk");
      const eggs = await adapter.addItem("Eggs");

      expect(await adapter.load()).toEqual({
        householdName: "Avery",
        listName: "Weekend Groceries",
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
    activeMember: {
      id: "mbr_avery",
      userId: "usr_avery",
      role: "owner" as const,
      displayName: "Avery Chen",
    },
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

function statementSql(statement: HouseholdSqlStatement | undefined): string {
  if (!statement) return "";
  return typeof statement === "string" ? statement : statement.sql;
}

function statementArgs(statement: HouseholdSqlStatement | undefined) {
  if (!statement || typeof statement === "string") return [];
  return statement.args ?? [];
}
