import { eq, sql } from "drizzle-orm";
import { households, users } from "@/db/schema/directory";
import type { DirectoryDb } from "@/db/server/client";
import { runWithSqliteBusyRetry } from "@/db/utils";
import { DeletedUserError } from "@/lib/services/user/server/user-service";

type DirectoryTransaction = Parameters<
	Parameters<DirectoryDb["transaction"]>[0]
>[0];

export type LifecycleLockExecutor = DirectoryDb | DirectoryTransaction;

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

export async function runHouseholdLifecycleCommand<T>(input: {
	householdId: string;
	directory: LifecycleLockExecutor;
	command: (directory: LifecycleLockExecutor) => Promise<T>;
}): Promise<T> {
	if (hasTransaction(input.directory)) {
		return runWithSqliteBusyRetry(() =>
			input.directory.transaction(async (tx) => {
				await lockHouseholdLifecycle(input.householdId, tx);
				return input.command(tx);
			}),
		);
	}

	await lockHouseholdLifecycle(input.householdId, input.directory);
	return input.command(input.directory);
}

export async function assertActiveUserLifecycle(
	userId: string,
	directory: LifecycleLockExecutor,
) {
	await lockUserLifecycle(userId, directory);
	const [user] = await directory
		.select({ deletedAt: users.deletedAt })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!user || user.deletedAt !== null) {
		throw new DeletedUserError();
	}
}

function hasTransaction(
	directory: LifecycleLockExecutor,
): directory is DirectoryDb {
	return "transaction" in directory;
}
