import type {
	PowerSyncBackendConnector,
	PowerSyncDatabase,
	QueryResult,
	SyncStatus,
	Transaction,
} from "@powersync/react-native";
import { db } from "@/lib/powersync";
import type {
	ProductDatabase,
	ProductQuerier,
	ProductRow,
	ProductWriteResult,
} from "@/lib/services/shared/product-database";

// The product tables synced onto the local PowerSync DB. A change to any of them
// drives the session's `changes` refetch seam.
const PRODUCT_TABLES = ["lists", "items", "item_checks"] as const;

export type ProductSyncStatus = "synced" | "pending" | "offline" | "failed";

// The full app-facing handle: the narrow `ProductDatabase` the services consume,
// plus the lifecycle, change-notification, and sync-status seams the session
// controller and the active-list UI wire up. Wrapping the raw PowerSync handle
// here keeps the rest of the app off the PowerSync SDK surface (and off the
// native driver), and gives the services a SQLite executor a test can stand in.
export type AppProductDatabase = ProductDatabase & {
	connect(connector: PowerSyncBackendConnector): Promise<void>;
	disconnect(): Promise<void>;
	disconnectAndClear(): Promise<void>;
	subscribeChanges(listener: () => void): { remove: () => void };
	getSyncStatus(): ProductSyncStatus;
	subscribeSyncStatus(listener: () => void): { remove: () => void };
};

export function createPowerSyncAppDatabase(
	database: PowerSyncDatabase,
): AppProductDatabase {
	return {
		...querierFrom(database),
		writeTransaction(run) {
			return database.writeTransaction((tx) => run(querierFromTransaction(tx)));
		},
		connect: (connector) => database.connect(connector),
		disconnect: () => database.disconnect(),
		disconnectAndClear: () => database.disconnectAndClear(),
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
		getSyncStatus: () => syncStatusFrom(database.currentStatus),
		subscribeSyncStatus(listener) {
			const dispose = database.registerListener({
				statusChanged() {
					listener();
				},
			});
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

function syncStatusFrom(status: SyncStatus): ProductSyncStatus {
	const flow = status.dataFlowStatus;
	if (flow.downloadError || flow.uploadError) return "failed";
	if (status.connecting || flow.downloading || flow.uploading) return "pending";
	if (status.connected) return status.hasSynced ? "synced" : "pending";
	return "offline";
}
