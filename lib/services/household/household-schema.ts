import householdMigrationJournal from "@/db/migrations/household/meta/_journal.json";
import { asError } from "@/lib/errors";
import type { Logger } from "@/lib/logger";
import type { SyncResult } from "@/lib/services/sync/sync-types";
import type { HouseholdStoreExecutor } from "./household-store";

/**
 * The Household schema version this app build was compiled against: the
 * `when` timestamp of the newest bundled migration. The server records the
 * same value in `__drizzle_migrations.created_at` when it migrates a remote
 * Household DB, and Turso sync replicates that table (and its DDL) into the
 * local replica together, so the local tracking table is a truthful signal
 * of the local replica's schema state.
 */
export const EXPECTED_HOUSEHOLD_SCHEMA_VERSION =
	householdMigrationJournal.entries.reduce(
		(latest, entry) => Math.max(latest, entry.when),
		0,
	);

export type HouseholdSchemaReadiness = {
	status: "ready" | "stale";
	healedBySync: boolean;
};

type EnsureHouseholdSchemaReadyDeps = {
	store: HouseholdStoreExecutor;
	sync: () => Promise<SyncResult>;
	logger: Logger;
	expectedVersion?: number;
};

/**
 * Guarantees, when online, that the local replica's schema matches the schema
 * this app build was compiled against before any service reads run.
 *
 * A replica is stale when a remote migration ran while this device had not
 * synced (the fanout migrates remote Household DBs; the DDL only reaches the
 * replica on the next pull). One sync heals it. When the sync cannot complete
 * (offline) or the remote itself has not been migrated yet, the session
 * proceeds on the previous schema and services surface their normal errors.
 */
export async function ensureHouseholdSchemaReady(
	deps: EnsureHouseholdSchemaReadyDeps,
): Promise<HouseholdSchemaReadiness> {
	const expectedVersion =
		deps.expectedVersion ?? EXPECTED_HOUSEHOLD_SCHEMA_VERSION;
	const log = deps.logger.with({ expected_schema_version: expectedVersion });
	const localVersion = await readLocalHouseholdSchemaVersion(deps.store);

	if (localVersion > expectedVersion) {
		log.warn("household schema is newer than this app build", {
			local_schema_version: localVersion,
		});
		return { status: "ready", healedBySync: false };
	}
	if (localVersion === expectedVersion) {
		return { status: "ready", healedBySync: false };
	}

	try {
		await deps.sync();
	} catch (error) {
		log.warn("household schema sync-before-read failed", {
			local_schema_version: localVersion,
			error: asError(error),
		});
		return { status: "stale", healedBySync: false };
	}

	const syncedVersion = await readLocalHouseholdSchemaVersion(deps.store);
	if (syncedVersion >= expectedVersion) {
		log.info("household schema healed by sync before first read", {
			previous_schema_version: localVersion,
			local_schema_version: syncedVersion,
		});
		return { status: "ready", healedBySync: true };
	}

	log.warn("household schema still stale after sync", {
		local_schema_version: syncedVersion,
	});
	return { status: "stale", healedBySync: false };
}

async function readLocalHouseholdSchemaVersion(
	store: HouseholdStoreExecutor,
): Promise<number> {
	try {
		const result = await store.execute({
			kind: "read",
			sql: "SELECT max(created_at) AS version FROM __drizzle_migrations",
		});
		const version = Number(result.rows[0]?.version ?? 0);
		return Number.isFinite(version) ? version : 0;
	} catch {
		// No tracking table means no server migration has ever reached this
		// replica; treat as the oldest possible schema.
		return 0;
	}
}
