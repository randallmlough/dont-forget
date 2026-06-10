import { createDatabaseOperationQueue } from "@/db/utils";
import { asError } from "@/lib/errors";
import { logger as defaultLogger, type Logger } from "@/lib/logger";

export type SyncResult = {
	changed: boolean;
};

export type SyncInterruptionReason =
	| "networkUnavailable"
	| "recoverableEngineFailure";

export class SyncInterruptedError extends Error {
	readonly reason: SyncInterruptionReason;
	readonly cause: Error;

	constructor(reason: SyncInterruptionReason, cause: unknown) {
		super(syncInterruptedMessage(reason));
		this.name = "SyncInterruptedError";
		this.reason = reason;
		this.cause = asError(cause);
	}
}

export function isSyncInterruptedError(
	error: unknown,
): error is SyncInterruptedError {
	return error instanceof SyncInterruptedError;
}

export function nativeSyncInterruptedError(
	error: unknown,
): SyncInterruptedError | null {
	if (hasNativeSyncErrorMessage(error, NETWORK_UNAVAILABLE_MESSAGES)) {
		return new SyncInterruptedError("networkUnavailable", error);
	}

	if (hasNativeSyncErrorMessage(error, RECOVERABLE_SYNC_ENGINE_MESSAGES)) {
		return new SyncInterruptedError("recoverableEngineFailure", error);
	}

	return null;
}

function hasNativeSyncErrorMessage(
	error: unknown,
	messages: string[],
): boolean {
	const normalizedMessage = asError(error).message.toLowerCase();
	return messages.some((message) => normalizedMessage.includes(message));
}

function syncInterruptedMessage(reason: SyncInterruptionReason): string {
	switch (reason) {
		case "networkUnavailable":
			return "Network unavailable during Household sync";
		case "recoverableEngineFailure":
			return "Recoverable Household sync engine failure";
	}
}

const NETWORK_UNAVAILABLE_MESSAGES = [
	"network request failed",
	"not connected to the internet",
	"network connection was lost",
	"internet connection appears to be offline",
	"could not connect to the server",
];

const RECOVERABLE_SYNC_ENGINE_MESSAGES = [
	"unable to checkpoint synced portion of wal",
];

export type HouseholdSqlValue = string | number | null | ArrayBuffer;

export type HouseholdSqlStatement = {
	kind: "read" | "write";
	sql: string;
	args?: HouseholdSqlValue[];
};

export type HouseholdSqlResult = {
	rows: Record<string, unknown>[];
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
	) => Promise<{ rows: Record<string, unknown>[] }>;
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
	) => Promise<Record<string, unknown>[]>;
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
			const { kind, sql, args } = normalizeStatement(statement);
			if (kind === "read") {
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
				await runNativeSyncOperation(() => database.push());
			});
		},
		async pull() {
			return enqueueDatabaseOperation(async () => {
				return { changed: await runNativeSyncOperation(() => database.pull()) };
			});
		},
		async sync() {
			return enqueueDatabaseOperation(async () => {
				const changedBeforePush = await runNativeSyncOperation(() =>
					database.pull(),
				);
				await runNativeSyncOperation(() => database.push());
				const changedAfterPush = await runNativeSyncOperation(() =>
					database.pull(),
				);
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
	kind: "read" | "write";
	sql: string;
	args: HouseholdSqlValue[];
} {
	return {
		kind: statement.kind,
		sql: statement.sql,
		args: statement.args ?? [],
	};
}

async function runNativeSyncOperation<T>(
	operation: () => Promise<T>,
): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		throw nativeSyncInterruptedError(error) ?? error;
	}
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
