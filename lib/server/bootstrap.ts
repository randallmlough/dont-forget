import { and, asc, eq, isNull, or } from "drizzle-orm";

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

type DirectoryTransaction = Parameters<Parameters<DirectoryDb["transaction"]>[0]>[0];
type DirectorySession = DirectoryDb | DirectoryTransaction;
type BootstrapDirectoryDeps = Omit<BootstrapServiceDeps, "directory"> & { directory: DirectorySession };

export type BootstrapServiceDeps = {
  appEnv: AppEnv;
  directory: DirectoryDb;
  now: () => number;
  createId: (prefix: AppIdPrefix) => string;
  provisionHouseholdDatabase: (input: {
    tursoDbName: string;
    createdByClerkUserId: string;
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
    provisionHouseholdDatabase: async ({ tursoDbName, createdByClerkUserId, createdByUserId, now }) => {
      const database = await platform.ensureDatabase(tursoDbName);
      await migrateHouseholdDb(tursoDbName, config);
      await ensureDefaultListInRemoteHousehold(
        database.url,
        config.platformGroupToken,
        createdByClerkUserId,
        createdByUserId,
        now,
      );
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
  const database = await ensureProvisioned(active, user, deps);
  const expiresAt = deps.now() + HOUSEHOLD_TOKEN_TTL_MS;
  const authToken = await deps.createHouseholdDatabaseToken(active.householdTursoDbName);
  const members = await activeMembers(active.householdId, deps.directory);

  return {
    user: {
      id: user.id,
      clerkUserId: user.clerkUserId,
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
      clerkUserId: user.clerkUserId,
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
  const profileFields = {
    email: profile.email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    displayName: profile.displayName,
    updatedAt: now,
  };

  await deps.directory
    .insert(users)
    .values({
      id: deps.createId("usr"),
      clerkUserId: profile.clerkUserId,
      ...profileFields,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: profileFields,
    });

  const [user] = await deps.directory
    .select()
    .from(users)
    .where(eq(users.clerkUserId, profile.clerkUserId))
    .limit(1);

  if (!user) {
    throw new Error("Unable to load bootstrapped User");
  }

  return user;
}

async function getOrCreateActiveMembership(
  user: User,
  profile: ServerUserProfile,
  deps: BootstrapServiceDeps,
): Promise<ActiveMembershipRow> {
  return deps.directory.transaction(async (tx) => {
    const txDeps: BootstrapDirectoryDeps = { ...deps, directory: tx };
    const active = await oldestActiveMembership(user, tx);
    if (active) return active;

    const pending = await pendingCreatedHousehold(user, tx);
    if (pending) {
      const membership = await ensureOwnerMembership(pending.id, user, txDeps);
      return activeRowFrom(pending, membership);
    }

    const now = deps.now();
    const householdId = deps.createId("hh");
    const household: Household = {
      id: householdId,
      name: profile.firstName ?? "Untitled",
      tursoDbName: householdDatabaseName(deps.appEnv, householdId),
      createdByClerkUserId: user.clerkUserId,
      createdByUserId: user.id,
      provisioningCompletedAt: null,
      createdAt: now,
      deletedAt: null,
    };
    const membership: Membership = {
      id: deps.createId("mbr"),
      householdId,
      clerkUserId: user.clerkUserId,
      userId: user.id,
      role: "owner",
      joinedAt: now,
      removedAt: null,
      tursoTokenId: null,
    };

    await tx.insert(households).values(household);
    await tx.insert(memberships).values(membership);
    return activeRowFrom(household, membership);
  });
}

async function oldestActiveMembership(
  user: User,
  directory: DirectorySession,
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
      and(
        or(eq(memberships.userId, user.id), eq(memberships.clerkUserId, user.clerkUserId)),
        isNull(memberships.removedAt),
        isNull(households.deletedAt),
      ),
    )
    .orderBy(asc(memberships.joinedAt), asc(memberships.id))
    .limit(1);

  return row ?? null;
}

async function pendingCreatedHousehold(
  user: User,
  directory: DirectorySession,
): Promise<Household | null> {
  const [row] = await directory
    .select()
    .from(households)
    .where(
      and(
        or(eq(households.createdByUserId, user.id), eq(households.createdByClerkUserId, user.clerkUserId)),
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
  user: User,
  deps: BootstrapDirectoryDeps,
): Promise<Membership> {
  const [existing] = await deps.directory
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.householdId, householdId),
        or(eq(memberships.userId, user.id), eq(memberships.clerkUserId, user.clerkUserId)),
        isNull(memberships.removedAt),
      ),
    )
    .limit(1);

  if (existing) return existing;

  const membership: Membership = {
    id: deps.createId("mbr"),
    householdId,
    clerkUserId: user.clerkUserId,
    userId: user.id,
    role: "owner",
    joinedAt: deps.now(),
    removedAt: null,
    tursoTokenId: null,
  };
  await deps.directory.insert(memberships).values(membership);
  return membership;
}

async function ensureProvisioned(
  active: ActiveMembershipRow,
  user: User,
  deps: BootstrapServiceDeps,
): Promise<{ url: string }> {
  if (active.householdProvisioningCompletedAt !== null) {
    return { url: deps.householdDatabaseUrl(active.householdTursoDbName) };
  }

  const database = await deps.provisionHouseholdDatabase({
    tursoDbName: active.householdTursoDbName,
    createdByClerkUserId: user.clerkUserId,
    createdByUserId: user.id,
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
      clerkUserId: users.clerkUserId,
      role: memberships.role,
      displayName: users.displayName,
      joinedAt: memberships.joinedAt,
    })
    .from(memberships)
    .innerJoin(users, or(eq(users.id, memberships.userId), eq(users.clerkUserId, memberships.clerkUserId)))
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
  createdByClerkUserId: string,
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
        createdByClerkUserId,
        createdByUserId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: lists.id });
  } finally {
    await client.close();
  }
}
