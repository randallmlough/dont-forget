import type {
	PowerSyncBackendConnector,
	PowerSyncDatabase,
	SyncStatus as PowerSyncDatabaseStatus,
	QueryResult,
	Transaction,
} from "@powersync/react-native";
import type {
	ProductDataExecutor,
	ProductDataRow,
	ProductDataStore,
	ProductDataWriteResult,
} from "@/lib/services/shared/product-data-store";
import { db } from "./powersync";

const PRODUCT_TABLES = ["lists", "items", "item_checks"] as const;

export type ProductSyncStatus = "synced" | "pending" | "offline" | "failed";

export type PowerSyncAppDatabase = ProductDataStore & {
	connect(connector: PowerSyncBackendConnector): Promise<void>;
	disconnect(): Promise<void>;
	disconnectAndClear(): Promise<void>;
	getStatus(): ProductSyncStatus;
	subscribeStatus(listener: () => void): { remove: () => void };
};

export const powerSyncAppDatabase = createPowerSyncAppDatabase(db);

export function createPowerSyncAppDatabase(
	database: PowerSyncDatabase,
): PowerSyncAppDatabase {
	const executor = productExecutorFrom(database);

	return {
		...executor,
		writeTransaction(run) {
			return database.writeTransaction((tx) =>
				run(productExecutorFromTransaction(tx)),
			);
		},
		changes: {
			subscribe(listener) {
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
		},
		connect(connector) {
			return database.connect(connector);
		},
		disconnect() {
			return database.disconnect();
		},
		disconnectAndClear() {
			return database.disconnectAndClear();
		},
		getStatus() {
			return productSyncStatusFrom(database.currentStatus);
		},
		subscribeStatus(listener) {
			const dispose = database.registerListener({
				statusChanged() {
					listener();
				},
			});
			return { remove: dispose };
		},
	};
}

function productExecutorFrom(database: PowerSyncDatabase): ProductDataExecutor {
	return {
		async execute(sql, parameters) {
			return productWriteResultFrom(
				await database.execute(sql, normalizeParameters(parameters)),
			);
		},
		getAll(sql, parameters) {
			return database.getAll(sql, normalizeParameters(parameters));
		},
		getOptional(sql, parameters) {
			return database.getOptional(sql, normalizeParameters(parameters));
		},
	};
}

function productExecutorFromTransaction(tx: Transaction): ProductDataExecutor {
	return {
		async execute(sql, parameters) {
			return productWriteResultFrom(
				await tx.execute(sql, normalizeParameters(parameters)),
			);
		},
		getAll(sql, parameters) {
			return tx.getAll(sql, normalizeParameters(parameters));
		},
		getOptional(sql, parameters) {
			return tx.getOptional(sql, normalizeParameters(parameters));
		},
	};
}

function normalizeParameters(
	parameters: readonly unknown[] | undefined,
): unknown[] | undefined {
	return parameters ? [...parameters] : undefined;
}

function productWriteResultFrom(result: QueryResult): ProductDataWriteResult {
	return {
		rowsAffected: result.rowsAffected,
		rows: result.rows?._array.map(normalizeRow) ?? [],
	};
}

function normalizeRow(row: unknown): ProductDataRow {
	if (row && typeof row === "object" && !Array.isArray(row)) {
		return { ...row };
	}

	return {};
}

function productSyncStatusFrom(
	status: PowerSyncDatabaseStatus,
): ProductSyncStatus {
	const dataFlow = status.dataFlowStatus;
	if (dataFlow.downloadError || dataFlow.uploadError) return "failed";
	if (status.connecting || dataFlow.downloading || dataFlow.uploading) {
		return "pending";
	}
	if (status.connected) {
		return status.hasSynced ? "synced" : "pending";
	}
	return "offline";
}
