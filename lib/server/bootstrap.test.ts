import { eq } from "drizzle-orm";

import { createTestDirectoryDb, createTestHouseholdDb, type TestHouseholdDb } from "@/db/test";
import { households, memberships, users } from "@/db/schema/directory";
import { lists } from "@/db/schema/household";
import { DEFAULT_LIST_ID, DEFAULT_LIST_NAME } from "@/lib/bootstrap";
import {
  bootstrapUser,
  householdDatabaseName,
  type BootstrapServiceDeps,
} from "@/lib/server/bootstrap";
import type { AppIdPrefix } from "@/lib/ids";
import type { ServerUserProfile } from "@/lib/server/auth";

describe("bootstrapUser", () => {
  it("generates Turso-safe Household database names", () => {
    const name = householdDatabaseName("production", "hh_48489c0d-46cd-4a90-a545-850d7b7feaf1");

    expect(name).toBe("df-production-hh-48489c0d46cd4a90a545850d7b7feaf1");
    expect(name.length).toBeLessThanOrEqual(51);
    expect(name).toMatch(/^[a-z0-9-]+$/);
  });

  it("creates a first-run User, Household, Owner Membership, Household DB, and default List", async () => {
    const harness = await createBootstrapHarness();

    try {
      const response = await bootstrapUser(averyProfile, harness.deps);

      expect(response.user).toMatchObject({
        id: "usr_1",
        displayName: "Avery Chen",
      });
      expect(response.activeHousehold).toEqual({ id: "hh_1", name: "Avery" });
      expect(response.activeMember).toMatchObject({ id: "mbr_1", userId: "usr_1", role: "owner" });
      expect(response.activeList).toEqual({ id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME });
      expect(response.householdDatabase.authToken).toBe(
        `token-${householdDatabaseName("test", "hh_1")}`,
      );

      const directoryUsers = await harness.directory.db.select().from(users);
      const directoryHouseholds = await harness.directory.db.select().from(households);
      const directoryMemberships = await harness.directory.db.select().from(memberships);
      const householdDb = harness.householdDbFor(householdDatabaseName("test", "hh_1"));
      const householdLists = await householdDb.db.select().from(lists);

      expect(directoryUsers).toHaveLength(1);
      expect(directoryHouseholds).toMatchObject([
        {
          id: "hh_1",
          name: "Avery",
          createdByUserId: "usr_1",
          provisioningCompletedAt: expect.any(Number),
        },
      ]);
      expect(directoryMemberships).toMatchObject([
        { id: "mbr_1", householdId: "hh_1", userId: "usr_1", role: "owner" },
      ]);
      expect(householdLists).toMatchObject([
        { id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME, createdByUserId: "usr_1" },
      ]);
    } finally {
      await harness.close();
    }
  });

  it("is idempotent for repeated calls from the same Clerk User", async () => {
    const harness = await createBootstrapHarness();

    try {
      await bootstrapUser(averyProfile, harness.deps);
      await bootstrapUser(averyProfile, harness.deps);

      expect(await harness.directory.db.select().from(users)).toHaveLength(1);
      expect(await harness.directory.db.select().from(households)).toHaveLength(1);
      expect(await harness.directory.db.select().from(memberships)).toHaveLength(1);

      const householdDb = harness.householdDbFor(householdDatabaseName("test", "hh_1"));
      expect(await householdDb.db.select().from(lists)).toHaveLength(1);
      expect(harness.createdDatabases).toEqual([householdDatabaseName("test", "hh_1")]);
    } finally {
      await harness.close();
    }
  });

  it("uses the oldest active Membership until explicit Household switching exists", async () => {
    const harness = await createBootstrapHarness();

    try {
      await harness.directory.db.insert(users).values({
        id: "usr_existing",
        clerkUserId: "clerk_avery",
        displayName: "Old Name",
      });
      await harness.directory.db.insert(households).values([
        {
          id: "hh_newer",
          name: "Newer",
          tursoDbName: "db-newer",
          createdByClerkUserId: "clerk_avery",
          createdByUserId: "usr_existing",
          provisioningCompletedAt: 1,
          createdAt: 1,
        },
        {
          id: "hh_older",
          name: "Older",
          tursoDbName: "db-older",
          createdByClerkUserId: "clerk_avery",
          createdByUserId: "usr_existing",
          provisioningCompletedAt: 1,
          createdAt: 1,
        },
      ]);
      await harness.directory.db.insert(memberships).values([
        {
          id: "mbr_newer",
          householdId: "hh_newer",
          clerkUserId: "clerk_avery",
          userId: "usr_existing",
          role: "member",
          joinedAt: 20,
        },
        {
          id: "mbr_older",
          householdId: "hh_older",
          clerkUserId: "clerk_avery",
          userId: "usr_existing",
          role: "owner",
          joinedAt: 10,
        },
      ]);

      const response = await bootstrapUser(averyProfile, harness.deps);

      expect(response.activeHousehold).toEqual({ id: "hh_older", name: "Older" });
      expect(response.activeMember).toMatchObject({ id: "mbr_older", role: "owner" });
      expect(await harness.directory.db.select().from(households)).toHaveLength(2);
    } finally {
      await harness.close();
    }
  });

  it("retries a pending created Household without creating duplicate directory rows", async () => {
    const harness = await createBootstrapHarness();

    try {
      await harness.directory.db.insert(users).values({
        id: "usr_existing",
        clerkUserId: "clerk_avery",
        displayName: "Avery Chen",
      });
      await harness.directory.db.insert(households).values({
        id: "hh_pending",
        name: "Avery",
        tursoDbName: "db-pending",
        createdByClerkUserId: "clerk_avery",
        createdByUserId: "usr_existing",
        provisioningCompletedAt: null,
      });

      const response = await bootstrapUser(averyProfile, harness.deps);

      expect(response.activeHousehold).toEqual({ id: "hh_pending", name: "Avery" });
      expect(await harness.directory.db.select().from(households)).toHaveLength(1);
      expect(await harness.directory.db.select().from(memberships)).toMatchObject([
        { householdId: "hh_pending", userId: "usr_existing", role: "owner" },
      ]);
      const [pending] = await harness.directory.db
        .select()
        .from(households)
        .where(eq(households.id, "hh_pending"));
      expect(pending.provisioningCompletedAt).toEqual(expect.any(Number));
    } finally {
      await harness.close();
    }
  });

  it("loads active Memberships that were still written with Clerk IDs", async () => {
    const harness = await createBootstrapHarness();

    try {
      await harness.directory.db.insert(users).values({
        id: "usr_existing",
        clerkUserId: "clerk_avery",
        displayName: "Avery Chen",
      });
      await harness.directory.client.execute({
        sql: `
          INSERT INTO households (
            id,
            name,
            turso_db_name,
            created_by_clerk_user_id,
            provisioning_completed_at,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
        args: ["hh_legacy", "Legacy", "db-legacy", "clerk_avery", 1, 10],
      });
      await harness.directory.client.execute({
        sql: `
          INSERT INTO memberships (id, household_id, clerk_user_id, role, joined_at)
          VALUES (?, ?, ?, ?, ?)
        `,
        args: ["mbr_legacy", "hh_legacy", "clerk_avery", "owner", 10],
      });

      const response = await bootstrapUser(averyProfile, harness.deps);

      expect(response.activeHousehold).toEqual({ id: "hh_legacy", name: "Legacy" });
      expect(response.members).toMatchObject([
        { membershipId: "mbr_legacy", userId: "usr_existing", clerkUserId: "clerk_avery" },
      ]);
    } finally {
      await harness.close();
    }
  });

});

const averyProfile: ServerUserProfile = {
  clerkUserId: "clerk_avery",
  email: "avery@example.com",
  firstName: "Avery",
  lastName: "Chen",
  displayName: "Avery Chen",
};

async function createBootstrapHarness() {
  const directory = await createTestDirectoryDb();
  const householdDbs = new Map<string, TestHouseholdDb>();
  const createdDatabases: string[] = [];
  const counters = new Map<AppIdPrefix, number>();
  let now = 1_700_000_000_000;

  const deps: BootstrapServiceDeps = {
    appEnv: "test",
    directory: directory.db,
    now: () => now++,
    createId: (prefix) => {
      const next = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, next);
      return `${prefix}_${next}`;
    },
    async provisionHouseholdDatabase({
      tursoDbName,
      createdByClerkUserId,
      createdByUserId,
      now: listNow,
    }) {
      if (!householdDbs.has(tursoDbName)) {
        householdDbs.set(tursoDbName, await createTestHouseholdDb());
        createdDatabases.push(tursoDbName);
      }
      const household = householdDbs.get(tursoDbName);
      if (!household) throw new Error(`Missing Household DB ${tursoDbName}`);
      await household.db
        .insert(lists)
        .values({
          id: DEFAULT_LIST_ID,
          name: DEFAULT_LIST_NAME,
          createdByClerkUserId,
          createdByUserId,
          createdAt: listNow,
          updatedAt: listNow,
        })
        .onConflictDoNothing({ target: lists.id });
      return { url: `file:${household.path}` };
    },
    async createHouseholdDatabaseToken(tursoDbName) {
      return `token-${tursoDbName}`;
    },
    householdDatabaseUrl(tursoDbName) {
      return `file:${householdDbs.get(tursoDbName)?.path ?? tursoDbName}`;
    },
  };

  return {
    directory,
    deps,
    createdDatabases,
    householdDbFor(tursoDbName: string) {
      const household = householdDbs.get(tursoDbName);
      if (!household) throw new Error(`Missing Household DB ${tursoDbName}`);
      return household;
    },
    async close() {
      await directory.close();
      await Promise.all([...householdDbs.values()].map((household) => household.close()));
    },
  };
}
