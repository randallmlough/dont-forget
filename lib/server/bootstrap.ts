import { and, asc, eq, isNull } from "drizzle-orm";

import { householdClient, householdDb, householdDbUrl, type DirectoryDb } from "@/db/client";
import { migrateHouseholdDb } from "@/db/household-migrations";
import { households, memberships, users, type Household, type Membership, type User } from "@/db/schema/directory";
import { lists } from "@/db/schema/household";
import {
  DEFAULT_LIST_ID,
  DEFAULT_LIST_NAME,
  HOUSEHOLD_TOKEN_TTL_MS,
  type BootstrapResponse,
} from "@/lib/bootstrap";
import { createAppId, type AppIdPrefix } from "@/lib/ids";
import { readTursoOperatorConfig, type AppEnv } from "@/lib/env";
import { createTursoPlatformClient } from "./turso-platform";
import type { ServerUserProfile } from "./auth";

type ActiveMembershipRow = {
  membershipId: string;
  membershipRole: "owner" | "member";
  householdId: string;
  householdName: string;
  householdTursoDbName: string;
  householdProvisioningCompletedAt: number | null;
};

export type BootstrapServiceDeps = {
  appEnv: AppEnv;
  directory: DirectoryDb;
  now: () => number;
  createId: (prefix: AppIdPrefix) => string;
  provisionHouseholdDatabase: (input: {
    tursoDbName: string;
    createdByUserId: string;
    now: number;
  }) => Promise<{ url: string }>;
  createHouseholdDatabaseToken: (tursoDbName: string) => Promise<string>;
  householdDatabaseUrl: (tursoDbName: string) => string;
};

export function createProductionBootstrapDeps(directory: DirectoryDb): BootstrapServiceDeps {
  const config = readTursoOperatorConfig();
  const platform = createTursoPlatformClient(config);

  return {
    appEnv: config.appEnv,
    directory,
    now: Date.now,
    createId: createAppId,
    provisionHouseholdDatabase: async ({ tursoDbName, createdByUserId, now }) => {
      const database = await platform.ensureDatabase(tursoDbName);
      await migrateHouseholdDb(tursoDbName);
      await ensureDefaultListInRemoteHousehold(database.url, config.platformGroupToken, createdByUserId, now);
      return database;
    },
    createHouseholdDatabaseToken: (tursoDbName) => platform.createDatabaseAuthToken(tursoDbName, "24h"),
    householdDatabaseUrl: (tursoDbName) => householdDbUrl(tursoDbName, config.org),
  };
}

export async function bootstrapUser(
  profile: ServerUserProfile,
  deps: BootstrapServiceDeps,
): Promise<BootstrapResponse> {
  const user = await upsertUser(profile, deps);
  const active = await getOrCreateActiveMembership(user, profile, deps);
  const database = await ensureProvisioned(active, user.id, deps);
  const expiresAt = deps.now() + HOUSEHOLD_TOKEN_TTL_MS;
  const authToken = await deps.createHouseholdDatabaseToken(active.householdTursoDbName);
  const members = await activeMembers(active.householdId, deps.directory);

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    },
    activeHousehold: {
      id: active.householdId,
      name: active.householdName,
    },
    activeMember: {
      id: active.membershipId,
      userId: user.id,
      role: active.membershipRole,
      displayName: user.displayName,
    },
    activeList: {
      id: DEFAULT_LIST_ID,
      name: DEFAULT_LIST_NAME,
    },
    members,
    householdDatabase: {
      url: database.url,
      authToken,
      expiresAt,
    },
  };
}

export function householdDatabaseName(appEnv: AppEnv, householdId: string): string {
  const suffix = householdId.replace(/^hh_/, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (!suffix) {
    throw new Error("Household ID must include a database-safe suffix");
  }

  return `df-${appEnv}-hh-${suffix.slice(0, 32)}`;
}

async function upsertUser(profile: ServerUserProfile, deps: BootstrapServiceDeps): Promise<User> {
  const now = deps.now();
  const [existing] = await deps.directory
    .select()
    .from(users)
    .where(eq(users.clerkUserId, profile.clerkUserId))
    .limit(1);

  if (existing) {
    const update = {
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      displayName: profile.displayName,
      updatedAt: now,
    };
    await deps.directory.update(users).set(update).where(eq(users.id, existing.id));
    return { ...existing, ...update };
  }

  const user: User = {
    id: deps.createId("usr"),
    clerkUserId: profile.clerkUserId,
    email: profile.email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    displayName: profile.displayName,
    createdAt: now,
    updatedAt: now,
  };
  await deps.directory.insert(users).values(user);
  return user;
}

async function getOrCreateActiveMembership(
  user: User,
  profile: ServerUserProfile,
  deps: BootstrapServiceDeps,
): Promise<ActiveMembershipRow> {
  const active = await oldestActiveMembership(user.id, deps.directory);
  if (active) return active;

  const pending = await pendingCreatedHousehold(user.id, deps.directory);
  if (pending) {
    const membership = await ensureOwnerMembership(pending.id, user.id, deps);
    return activeRowFrom(pending, membership);
  }

  const now = deps.now();
  const householdId = deps.createId("hh");
  const household: Household = {
    id: householdId,
    name: profile.firstName ?? "Untitled",
    tursoDbName: householdDatabaseName(deps.appEnv, householdId),
    createdByUserId: user.id,
    provisioningCompletedAt: null,
    createdAt: now,
    deletedAt: null,
  };
  const membership: Membership = {
    id: deps.createId("mbr"),
    householdId,
    userId: user.id,
    role: "owner",
    joinedAt: now,
    removedAt: null,
  };

  await deps.directory.insert(households).values(household);
  await deps.directory.insert(memberships).values(membership);
  return activeRowFrom(household, membership);
}

async function oldestActiveMembership(
  userId: string,
  directory: DirectoryDb,
): Promise<ActiveMembershipRow | null> {
  const [row] = await directory
    .select({
      membershipId: memberships.id,
      membershipRole: memberships.role,
      householdId: households.id,
      householdName: households.name,
      householdTursoDbName: households.tursoDbName,
      householdProvisioningCompletedAt: households.provisioningCompletedAt,
    })
    .from(memberships)
    .innerJoin(households, eq(households.id, memberships.householdId))
    .where(
      and(eq(memberships.userId, userId), isNull(memberships.removedAt), isNull(households.deletedAt)),
    )
    .orderBy(asc(memberships.joinedAt), asc(memberships.id))
    .limit(1);

  return row ?? null;
}

async function pendingCreatedHousehold(
  userId: string,
  directory: DirectoryDb,
): Promise<Household | null> {
  const [row] = await directory
    .select()
    .from(households)
    .where(
      and(
        eq(households.createdByUserId, userId),
        isNull(households.provisioningCompletedAt),
        isNull(households.deletedAt),
      ),
    )
    .orderBy(asc(households.createdAt), asc(households.id))
    .limit(1);

  return row ?? null;
}

async function ensureOwnerMembership(
  householdId: string,
  userId: string,
  deps: BootstrapServiceDeps,
): Promise<Membership> {
  const [existing] = await deps.directory
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.householdId, householdId),
        eq(memberships.userId, userId),
        isNull(memberships.removedAt),
      ),
    )
    .limit(1);

  if (existing) return existing;

  const membership: Membership = {
    id: deps.createId("mbr"),
    householdId,
    userId,
    role: "owner",
    joinedAt: deps.now(),
    removedAt: null,
  };
  await deps.directory.insert(memberships).values(membership);
  return membership;
}

async function ensureProvisioned(
  active: ActiveMembershipRow,
  userId: string,
  deps: BootstrapServiceDeps,
): Promise<{ url: string }> {
  if (active.householdProvisioningCompletedAt) {
    return { url: deps.householdDatabaseUrl(active.householdTursoDbName) };
  }

  const database = await deps.provisionHouseholdDatabase({
    tursoDbName: active.householdTursoDbName,
    createdByUserId: userId,
    now: deps.now(),
  });
  await deps.directory
    .update(households)
    .set({ provisioningCompletedAt: deps.now() })
    .where(eq(households.id, active.householdId));

  return database;
}

async function activeMembers(
  householdId: string,
  directory: DirectoryDb,
): Promise<BootstrapResponse["members"]> {
  const rows = await directory
    .select({
      membershipId: memberships.id,
      userId: users.id,
      role: memberships.role,
      displayName: users.displayName,
      joinedAt: memberships.joinedAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.householdId, householdId), isNull(memberships.removedAt)))
    .orderBy(asc(memberships.joinedAt), asc(memberships.id));

  return rows.map(({ joinedAt: _joinedAt, ...row }) => row);
}

function activeRowFrom(household: Household, membership: Membership): ActiveMembershipRow {
  return {
    membershipId: membership.id,
    membershipRole: membership.role,
    householdId: household.id,
    householdName: household.name,
    householdTursoDbName: household.tursoDbName,
    householdProvisioningCompletedAt: household.provisioningCompletedAt,
  };
}

async function ensureDefaultListInRemoteHousehold(
  url: string,
  authToken: string,
  createdByUserId: string,
  now: number,
): Promise<void> {
  const client = householdClient(url, authToken);

  try {
    await householdDb(client)
      .insert(lists)
      .values({
        id: DEFAULT_LIST_ID,
        name: DEFAULT_LIST_NAME,
        createdByUserId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: lists.id });
  } finally {
    await client.close();
  }
}
