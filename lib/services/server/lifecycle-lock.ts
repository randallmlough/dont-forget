import { eq, sql } from "drizzle-orm";

import type { DirectoryDb } from "@/db/client";
import { households, users } from "@/db/schema/directory";

type DirectoryTransaction = Parameters<
	Parameters<DirectoryDb["transaction"]>[0]
>[0];

type LifecycleLockExecutor = DirectoryDb | DirectoryTransaction;

// SQLite has no SELECT FOR UPDATE. These no-op writes serialize lifecycle
// decisions that must observe and mutate a single Household or User row.
export async function lockHouseholdLifecycle(
	householdId: string,
	directory: LifecycleLockExecutor,
) {
	await directory
		.update(households)
		.set({ id: sql`${households.id}` })
		.where(eq(households.id, householdId));
}

export async function lockUserLifecycle(
	userId: string,
	directory: LifecycleLockExecutor,
) {
	await directory
		.update(users)
		.set({ id: sql`${users.id}` })
		.where(eq(users.id, userId));
}
