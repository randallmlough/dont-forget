import type { HouseholdStoreExecutor, SyncResult } from "@/db/household-store";
import householdMigrationJournal from "@/db/migrations/household/meta/_journal.json";
import { DRIZZLE_MIGRATIONS_TABLE } from "@/db/utils";
import { asError } from "@/lib/errors";
import type { Logger } from "@/lib/logger";

/**
 * The Household schema version this app build was compiled against: the
 * `when` timestamp of the newest bundled migration. The server records the
 * same value in the migration tracking table's `created_at` when it migrates
 * a remote Household DB, and Turso sync replicates that table (and its DDL)
 * into the local replica together, so the local tracking table is a truthful
 * signal of the local replica's schema state.
 */
export const EXPECTED_HOUSEHOLD_SCHEMA_VERSION =
	householdMigrationJournal.entries.reduce(
		(latest, entry) => Math.max(latest, entry.when),
		0,
	);

const GATE_SYNC_TIMEOUT_MS = 5_000;

export type HouseholdSchemaReadiness = {
	status: "ready" | "stale";
	healedBySync: boolean;
};

type EnsureHouseholdSchemaReadyDeps = {
	store: HouseholdStoreExecutor;
	sync: () => Promise<SyncResult>;
	logger: Logger;
};

/**
 * The schema staleness gate (ADR-0013): guarantees, when online, that the
 * local replica's schema matches the schema this app build was compiled
 * against before any service reads run.
 *
 * A replica is stale when a remote migration ran while this device had not
 * synced (the fanout migrates remote Household DBs; the DDL only reaches the
 * replica on the next pull). One sync heals it. When the sync cannot complete
 * in time (offline, degraded network) or the remote itself has not been
 * migrated yet, the session proceeds on the previous schema and services
 * surface their normal errors; the Home List retries on the next successful
 * sync.
 */
export async function ensureHouseholdSchemaReady(
	deps: EnsureHouseholdSchemaReadyDeps,
): Promise<HouseholdSchemaReadiness> {
	const log = deps.logger.with({
		expected_schema_version: EXPECTED_HOUSEHOLD_SCHEMA_VERSION,
	});
	const localVersion = await readLocalHouseholdSchemaVersion(deps.store, log);

	if (localVersion > EXPECTED_HOUSEHOLD_SCHEMA_VERSION) {
		log.warn("household schema is newer than this app build", {
			local_schema_version: localVersion,
		});
		return { status: "ready", healedBySync: false };
	}
	if (localVersion === EXPECTED_HOUSEHOLD_SCHEMA_VERSION) {
		return { status: "ready", healedBySync: false };
	}

	const syncOutcome = await syncWithTimeout(deps.sync, log);
	if (syncOutcome !== "synced") {
		log.warn("household schema sync-before-read did not complete", {
			local_schema_version: localVersion,
			sync_outcome: syncOutcome,
		});
		return { status: "stale", healedBySync: false };
	}

	const syncedVersion = await readLocalHouseholdSchemaVersion(deps.store, log);
	if (syncedVersion >= EXPECTED_HOUSEHOLD_SCHEMA_VERSION) {
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

/**
 * Session open must not hang on a degraded network: stop waiting after a
 * deadline and proceed stale. The abandoned sync keeps running on the store's
 * operation queue, so the Home List's sync-driven retry can still heal the
 * session once it completes.
 */
async function syncWithTimeout(
	sync: () => Promise<SyncResult>,
	log: Logger,
): Promise<"synced" | "failed" | "timeout"> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<"timeout">((resolve) => {
		timer = setTimeout(() => resolve("timeout"), GATE_SYNC_TIMEOUT_MS);
	});
	const attempt = sync().then(
		() => "synced" as const,
		(error) => {
			log.warn("household schema gate sync failed", {
				error: asError(error),
			});
			return "failed" as const;
		},
	);

	try {
		return await Promise.race([attempt, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

async function readLocalHouseholdSchemaVersion(
	store: HouseholdStoreExecutor,
	log: Logger,
): Promise<number> {
	try {
		const result = await store.execute({
			kind: "read",
			sql: `SELECT max(created_at) AS version FROM ${DRIZZLE_MIGRATIONS_TABLE}`,
		});
		const version = Number(result.rows[0]?.version ?? 0);
		return Number.isFinite(version) ? version : 0;
	} catch (error) {
		// A missing tracking table means no server migration has ever reached
		// this replica: the oldest possible schema. Anything else is a real
		// store failure that must stay visible.
		if (!isMissingMigrationsTableError(error)) {
			log.warn("household schema version read failed", {
				error: asError(error),
			});
		}
		return 0;
	}
}

function isMissingMigrationsTableError(error: unknown): boolean {
	return asError(error).message.includes(
		`no such table: ${DRIZZLE_MIGRATIONS_TABLE}`,
	);
}
