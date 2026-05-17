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

export type HouseholdSyncResult = {
  changed: boolean;
};

export type HouseholdDb = {
  path: string;
  syncAuthorized: boolean;
  execute: (statement: HouseholdSqlStatement) => Promise<HouseholdSqlResult>;
  push: () => Promise<void>;
  pull: () => Promise<HouseholdSyncResult>;
  sync: () => Promise<HouseholdSyncResult>;
  close: () => Promise<void>;
  deleteLocalData: () => Promise<void>;
};

export type HouseholdDatabaseConfig = {
  url?: string | null;
  authToken?: string | null;
  expiresAt?: number | null;
};

export type OpenHouseholdDbConfig = {
  householdId: string;
  database: HouseholdDatabaseConfig;
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
  all: (sql: string, ...params: TursoBindParam[]) => Promise<Array<Record<string, unknown>>>;
  run: (sql: string, ...params: TursoBindParam[]) => Promise<{ changes: number; lastInsertRowid: number }>;
  push: () => Promise<void>;
  pull: () => Promise<boolean>;
  close: () => void | Promise<void>;
};

export type TursoHouseholdDbRuntime = {
  Database: new (options: TursoDatabaseOptions) => TursoDatabase;
  getDbPath: (filename: string) => string;
};

type HouseholdDbFileSystem = {
  deleteFilesWithPrefix: (path: string) => Promise<void>;
};

type OpenHouseholdDbOptions = {
  runtime?: TursoHouseholdDbRuntime;
  fileSystem?: HouseholdDbFileSystem;
};

const HOUSEHOLD_DB_CLIENT_NAME = "dont-forget-household-db";

export async function openHouseholdDb(
  config: OpenHouseholdDbConfig,
  options: OpenHouseholdDbOptions = {},
): Promise<HouseholdDb> {
  const runtime = options.runtime ?? (await loadTursoRuntime());
  const fileSystem = options.fileSystem ?? defaultHouseholdDbFileSystem;
  const path = runtime.getDbPath(householdDbFilename(config.householdId));
  const syncAuthorized = Boolean(config.database.url && config.database.authToken);
  const database = new runtime.Database({
    path,
    clientName: HOUSEHOLD_DB_CLIENT_NAME,
    bootstrapIfEmpty: syncAuthorized,
    ...(syncAuthorized
      ? {
          url: config.database.url ?? undefined,
          authToken: config.database.authToken ?? undefined,
        }
      : {}),
  });
  let closed = false;

  await database.connect();

  async function close() {
    if (closed) return;
    closed = true;
    await database.close();
  }

  return {
    path,
    syncAuthorized,
    async execute(statement) {
      const { sql, args } = normalizeStatement(statement);
      if (isReadStatement(sql)) {
        const rows = await database.all(sql, args);
        return { rows, rowsAffected: 0, lastInsertRowId: null };
      }

      const result = await database.run(sql, args);
      return { rows: [], rowsAffected: result.changes, lastInsertRowId: result.lastInsertRowid };
    },
    async push() {
      await database.push();
    },
    async pull() {
      return { changed: await database.pull() };
    },
    async sync() {
      await database.push();
      return { changed: await database.pull() };
    },
    close,
    async deleteLocalData() {
      await close();
      await deleteLocalHouseholdDbData(config.householdId, { runtime, fileSystem });
    },
  };
}

export async function deleteLocalHouseholdDbData(
  householdId: string,
  options: OpenHouseholdDbOptions = {},
): Promise<void> {
  const runtime = options.runtime ?? (await loadTursoRuntime());
  const fileSystem = options.fileSystem ?? defaultHouseholdDbFileSystem;
  const path = runtime.getDbPath(householdDbFilename(householdId));

  await fileSystem.deleteFilesWithPrefix(path);
}

export function householdDbFilename(householdId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(householdId)) {
    throw new Error("Household ID cannot be used as a local DB filename");
  }

  return `household-${householdId}.db`;
}

function normalizeStatement(statement: HouseholdSqlStatement): { sql: string; args: HouseholdSqlValue[] } {
  if (typeof statement === "string") {
    return { sql: statement, args: [] };
  }

  return { sql: statement.sql, args: statement.args ?? [] };
}

function isReadStatement(sql: string): boolean {
  const normalized = sql.trimStart().toLowerCase();
  return normalized.startsWith("select") || normalized.startsWith("with") || normalized.startsWith("pragma");
}

async function loadTursoRuntime(): Promise<TursoHouseholdDbRuntime> {
  const turso = await import("@tursodatabase/sync-react-native");
  return { Database: turso.Database, getDbPath: turso.getDbPath };
}

const defaultHouseholdDbFileSystem: HouseholdDbFileSystem = {
  async deleteFilesWithPrefix(path) {
    const fileSystem = await import("expo-file-system/legacy");
    const directoryPath = nativeDirectoryPath(path);
    const filename = nativeBasename(path);
    const directoryUri = nativePathToFileUri(directoryPath);
    const entries = await readDirectoryOrFallback(fileSystem.readDirectoryAsync, directoryUri, filename);

    await Promise.all(
      entries
        .filter((entry) => entry === filename || entry.startsWith(`${filename}-`))
        .map((entry) =>
          fileSystem.deleteAsync(nativePathToFileUri(`${directoryPath}${entry}`), { idempotent: true }),
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
    throw new Error("Household DB path must include a directory");
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
