import { eq } from "drizzle-orm";
import { households } from "@/server/db/schema/postgres";
import type { DirectoryDb } from "@/server/db/client";

export type DirectoryTransaction = Parameters<
	Parameters<DirectoryDb["transaction"]>[0]
>[0];

export type DirectoryExecutor = DirectoryDb | DirectoryTransaction;

export async function runDirectoryTransaction<T>(
	directory: DirectoryExecutor,
	command: (directory: DirectoryExecutor) => Promise<T>,
): Promise<T> {
	if (hasTransaction(directory)) {
		return directory.transaction(command);
	}

	return command(directory);
}

function hasTransaction(
	directory: DirectoryExecutor,
): directory is DirectoryDb {
	return "transaction" in directory;
}

// Postgres-native per-Household serialization: a row-level lock held until the
// surrounding transaction commits. Use at the start of read-then-write lifecycle
// commands whose multi-row invariant has no DB-level backstop (last-Owner,
// duplicate-pending-Invitation) so concurrent transactions queue instead of
// racing on stale reads.
export async function lockHouseholdRow(
	tx: DirectoryExecutor,
	householdId: string,
): Promise<void> {
	await tx
		.select({ id: households.id })
		.from(households)
		.where(eq(households.id, householdId))
		.for("update");
}
