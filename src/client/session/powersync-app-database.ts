import type {
	PowerSyncDatabase,
	QueryResult,
	Transaction,
} from "@powersync/react-native";
import type {
	ProductDatabase,
	ProductQuerier,
	ProductRow,
	ProductWriteResult,
} from "@/client/lib/product-database";
import { db } from "@/client/session/powersync";

// The product tables synced onto the local PowerSync DB. A change to any of them
// drives the session's `changes` refetch seam.
const PRODUCT_TABLES = ["lists", "items", "item_checks"] as const;

// The app-facing product-data handle: the narrow `ProductDatabase` the services
// consume, plus the product-table change seam watched resources subscribe to.
// PowerSync lifecycle and sync status are owned by the raw `db` singleton.
export type AppProductDatabase = ProductDatabase & {
	subscribeChanges(listener: () => void): { remove: () => void };
};

export function createPowerSyncAppDatabase(
	database: PowerSyncDatabase,
): AppProductDatabase {
	return {
		...querierFrom(database),
		writeTransaction(run) {
			return database.writeTransaction((tx) => run(querierFromTransaction(tx)));
		},
		subscribeChanges(listener) {
			const dispose = database.onChange(
				{
					onChange() {
						listener();
					},
				},
				{ tables: [...PRODUCT_TABLES] },
			);
			return { remove: dispose };
		},
	};
}

// The production singleton, wrapping the op-sqlite-backed PowerSync handle from
// PR-B. Constructed at module load but inert until `connect()` — the native
// driver only opens on first use, so importing this module is side-effect free.
export const appProductDatabase = createPowerSyncAppDatabase(db);

function querierFrom(database: PowerSyncDatabase): ProductQuerier {
	return {
		async execute(sql, params) {
			return writeResultFrom(
				await database.execute(sql, mutableParams(params)),
			);
		},
		getAll(sql, params) {
			return database.getAll(sql, mutableParams(params));
		},
		getOptional(sql, params) {
			return database.getOptional(sql, mutableParams(params));
		},
	};
}

function querierFromTransaction(tx: Transaction): ProductQuerier {
	return {
		async execute(sql, params) {
			return writeResultFrom(await tx.execute(sql, mutableParams(params)));
		},
		getAll(sql, params) {
			return tx.getAll(sql, mutableParams(params));
		},
		getOptional(sql, params) {
			return tx.getOptional(sql, mutableParams(params));
		},
	};
}

// The service interface hands us readonly params; PowerSync's surface takes a
// mutable array. Copy at the boundary.
function mutableParams(
	params: readonly unknown[] | undefined,
): unknown[] | undefined {
	return params ? [...params] : undefined;
}

function writeResultFrom(result: QueryResult): ProductWriteResult {
	return {
		rowsAffected: result.rowsAffected,
		rows: (result.rows?._array ?? []).map(rowFrom),
	};
}

function rowFrom(row: unknown): ProductRow {
	return row && typeof row === "object" && !Array.isArray(row)
		? { ...(row as Record<string, unknown>) }
		: {};
}
