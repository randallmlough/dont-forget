import { createDatabaseOperationQueue } from "@/db/utils";
import { asError } from "@/lib/errors";
import { logger as defaultLogger, type Logger } from "@/lib/logger";
import type { SyncResult } from "@/lib/services/sync";

export type HouseholdSqlValue = string | number | null | ArrayBuffer;

export type HouseholdSqlStatement =
	| string
	| {
			sql: string;
			args?: HouseholdSqlValue[];
	  };

export type HouseholdSqlResult = {
	rows: Array<Record<string, unknown>>;
	rowsAffected: number;
	lastInsertRowId: number | null;
};

export type HouseholdStore = {
	path: string;
	syncAuthorized: boolean;
	execute: (statement: HouseholdSqlStatement) => Promise<HouseholdSqlResult>;
	push: () => Promise<void>;
	pull: () => Promise<SyncResult>;
	sync: () => Promise<SyncResult>;
	close: () => Promise<void>;
	deleteLocalData: () => Promise<void>;
};

export type HouseholdStoreExecutor = {
	execute: (
		statement: HouseholdSqlStatement,
	) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export type HouseholdDatabaseConfig = {
	url?: string | null;
	authToken?: string | null;
	expiresAt?: number | null;
};

export type OpenHouseholdStoreConfig = {
	householdId: string;
	database: HouseholdDatabaseConfig;
	logger?: Logger;
};

type TursoDatabaseOptions = {
	path: string;
	url?: string;
	authToken?: string;
	clientName?: string;
	bootstrapIfEmpty?: boolean;
};

type TursoBindParam = HouseholdSqlValue | HouseholdSqlValue[];

type TursoDatabase = {
	connect: () => Promise<void>;
	all: (
		sql: string,
		...params: TursoBindParam[]
	) => Promise<Array<Record<string, unknown>>>;
	run: (
		sql: string,
		...params: TursoBindParam[]
	) => Promise<{ changes: number; lastInsertRowid: number }>;
	push: () => Promise<void>;
	pull: () => Promise<boolean>;
	close: () => void | Promise<void>;
};

export type TursoHouseholdStoreRuntime = {
	Database: new (options: TursoDatabaseOptions) => TursoDatabase;
	getDbPath: (filename: string) => string;
};

type HouseholdStoreFileSystem = {
	deleteFilesWithPrefix: (path: string) => Promise<void>;
};

type OpenHouseholdStoreOptions = {
	runtime?: TursoHouseholdStoreRuntime;
	fileSystem?: HouseholdStoreFileSystem;
};

const HOUSEHOLD_STORE_CLIENT_NAME = "dont-forget-household-db";

export async function openHouseholdStore(
	config: OpenHouseholdStoreConfig,
	options: OpenHouseholdStoreOptions = {},
): Promise<HouseholdStore> {
	const runtime = options.runtime ?? (await loadTursoRuntime());
	const fileSystem = options.fileSystem ?? defaultHouseholdStoreFileSystem;
	const path = runtime.getDbPath(householdStoreFilename(config.householdId));
	const syncAuthorized = Boolean(
		config.database.url && config.database.authToken,
	);
	const log = (config.logger ?? defaultLogger).with({
		household_id: config.householdId,
		sync_authorized: syncAuthorized,
	});
	const database = new runtime.Database({
		path,
		clientName: HOUSEHOLD_STORE_CLIENT_NAME,
		bootstrapIfEmpty: syncAuthorized,
		...(syncAuthorized
			? {
					url: config.database.url ?? undefined,
					authToken: config.database.authToken ?? undefined,
				}
			: {}),
	});
	let closed = false;
	const enqueueDatabaseOperation = createDatabaseOperationQueue();

	try {
		await database.connect();
	} catch (error) {
		log.error("household store connect failed", { error: asError(error) });
		throw error;
	}

	async function close() {
		if (closed) return;
		closed = true;
		return enqueueDatabaseOperation(async () => {
			try {
				await database.close();
			} catch (error) {
				log.error("household store close failed", { error: asError(error) });
				throw error;
			}
		});
	}

	return {
		path,
		syncAuthorized,
		async execute(statement) {
			const { sql, args } = normalizeStatement(statement);
			if (isReadStatement(sql)) {
				return enqueueDatabaseOperation(async () => {
					try {
						const rows = await database.all(sql, args);
						return { rows, rowsAffected: 0, lastInsertRowId: null };
					} catch (error) {
						log.error("household store query failed", {
							error: asError(error),
						});
						throw error;
					}
				});
			}

			return enqueueDatabaseOperation(async () => {
				try {
					const result = await database.run(sql, args);
					return {
						rows: [],
						rowsAffected: result.changes,
						lastInsertRowId: result.lastInsertRowid,
					};
				} catch (error) {
					log.error("household store write failed", { error: asError(error) });
					throw error;
				}
			});
		},
		async push() {
			return enqueueDatabaseOperation(async () => {
				await database.push();
			});
		},
		async pull() {
			return enqueueDatabaseOperation(async () => {
				return { changed: await database.pull() };
			});
		},
		async sync() {
			return enqueueDatabaseOperation(async () => {
				const changedBeforePush = await database.pull();
				await database.push();
				const changedAfterPush = await database.pull();
				return { changed: changedBeforePush || changedAfterPush };
			});
		},
		close,
		async deleteLocalData() {
			try {
				await close();
				await deleteLocalHouseholdStoreData(config.householdId, {
					runtime,
					fileSystem,
				});
			} catch (error) {
				log.error("household store local delete failed", {
					error: asError(error),
				});
				throw error;
			}
		},
	};
}

export async function deleteLocalHouseholdStoreData(
	householdId: string,
	options: OpenHouseholdStoreOptions = {},
): Promise<void> {
	const runtime = options.runtime ?? (await loadTursoRuntime());
	const fileSystem = options.fileSystem ?? defaultHouseholdStoreFileSystem;
	const path = runtime.getDbPath(householdStoreFilename(householdId));

	await fileSystem.deleteFilesWithPrefix(path);
}

export function householdStoreFilename(householdId: string): string {
	if (!/^[A-Za-z0-9_-]+$/.test(householdId)) {
		throw new Error("Household ID cannot be used as a local store filename");
	}

	return `household-${householdId}.db`;
}

function normalizeStatement(statement: HouseholdSqlStatement): {
	sql: string;
	args: HouseholdSqlValue[];
} {
	if (typeof statement === "string") {
		return { sql: statement, args: [] };
	}

	return { sql: statement.sql, args: statement.args ?? [] };
}

function isReadStatement(sql: string): boolean {
	const normalized = sql.trimStart().toLowerCase();
	return (
		normalized.startsWith("select") ||
		normalized.startsWith("with") ||
		normalized.startsWith("pragma")
	);
}

async function loadTursoRuntime(): Promise<TursoHouseholdStoreRuntime> {
	const turso = await import("@tursodatabase/sync-react-native");
	return { Database: turso.Database, getDbPath: turso.getDbPath };
}

const defaultHouseholdStoreFileSystem: HouseholdStoreFileSystem = {
	async deleteFilesWithPrefix(path) {
		const fileSystem = await import("expo-file-system/legacy");
		const directoryPath = nativeDirectoryPath(path);
		const filename = nativeBasename(path);
		const directoryUri = nativePathToFileUri(directoryPath);
		const entries = await readDirectoryOrFallback(
			fileSystem.readDirectoryAsync,
			directoryUri,
			filename,
		);

		await Promise.all(
			entries
				.filter(
					(entry) => entry === filename || entry.startsWith(`${filename}-`),
				)
				.map((entry) =>
					fileSystem.deleteAsync(
						nativePathToFileUri(`${directoryPath}${entry}`),
						{ idempotent: true },
					),
				),
		);
	},
};

async function readDirectoryOrFallback(
	readDirectoryAsync: (uri: string) => Promise<string[]>,
	directoryUri: string,
	filename: string,
): Promise<string[]> {
	try {
		return await readDirectoryAsync(directoryUri);
	} catch {
		return [filename, `${filename}-info`, `${filename}-wal`, `${filename}-shm`];
	}
}

function nativeDirectoryPath(path: string): string {
	const index = path.lastIndexOf("/");
	if (index < 0) {
		throw new Error("Household store path must include a directory");
	}

	return path.slice(0, index + 1);
}

function nativeBasename(path: string): string {
	const index = path.lastIndexOf("/");
	return index < 0 ? path : path.slice(index + 1);
}

function nativePathToFileUri(path: string): string {
	return path.startsWith("file://") ? path : `file://${path}`;
}
