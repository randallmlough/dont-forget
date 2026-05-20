import type {
	HouseholdDatabaseConfig,
	HouseholdSqlValue,
	HouseholdStore,
} from "./household-store";

type HouseholdSyncFallbackStore = {
	execute: (
		statement: Parameters<HouseholdStore["execute"]>[0],
	) => Promise<{ rows: Record<string, unknown>[] }>;
};

type RemoteSqlClient = {
	execute: (statement: {
		sql: string;
		args?: HouseholdSqlValue[];
	}) => Promise<unknown>;
	close?: () => void;
};

type RequiredRemoteDatabaseConfig = {
	url: string;
	authToken: string;
};

export type OpenHouseholdRemoteClient = (
	database: RequiredRemoteDatabaseConfig,
) => RemoteSqlClient | Promise<RemoteSqlClient>;

export async function pushLocalHouseholdRowsToRemote(
	store: HouseholdSyncFallbackStore,
	database: HouseholdDatabaseConfig,
	openRemoteClient: OpenHouseholdRemoteClient = openLibsqlRemoteClient,
) {
	if (!database.url || !database.authToken) {
		throw new Error("Household DB sync requires remote credentials");
	}

	const remote = await openRemoteClient({
		url: database.url,
		authToken: database.authToken,
	});

	try {
		await pushLocalLists(store, remote);
		await pushLocalItems(store, remote);
		await pushLocalItemChecks(store, remote);
	} finally {
		remote.close?.();
	}
}

async function openLibsqlRemoteClient(database: RequiredRemoteDatabaseConfig) {
	const { createClient } = await import("@libsql/client/web");
	return createClient({ url: database.url, authToken: database.authToken });
}

async function pushLocalLists(
	store: HouseholdSyncFallbackStore,
	remote: RemoteSqlClient,
) {
	const result = await store.execute({
		sql: "SELECT id, name, created_by_user_id, created_at, updated_at, deleted_at FROM lists",
	});

	for (const row of result.rows) {
		await remote.execute({
			sql: `
          INSERT INTO lists (id, name, created_by_user_id, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            created_by_user_id = excluded.created_by_user_id,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at
          WHERE excluded.updated_at >= lists.updated_at
        `,
			args: [
				sqlValue(row.id),
				sqlValue(row.name),
				sqlValue(row.created_by_user_id),
				sqlValue(row.created_at),
				sqlValue(row.updated_at),
				sqlValue(row.deleted_at),
			],
		});
	}
}

async function pushLocalItems(
	store: HouseholdSyncFallbackStore,
	remote: RemoteSqlClient,
) {
	const result = await store.execute({
		sql: "SELECT id, list_id, name, notes, position, created_by_user_id, created_at, updated_at, deleted_at FROM items",
	});

	for (const row of result.rows) {
		await remote.execute({
			sql: `
          INSERT INTO items (id, list_id, name, notes, position, created_by_user_id, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            list_id = excluded.list_id,
            name = excluded.name,
            notes = excluded.notes,
            position = excluded.position,
            created_by_user_id = excluded.created_by_user_id,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at
          WHERE excluded.updated_at >= items.updated_at
        `,
			args: [
				sqlValue(row.id),
				sqlValue(row.list_id),
				sqlValue(row.name),
				sqlValue(row.notes),
				sqlValue(row.position),
				sqlValue(row.created_by_user_id),
				sqlValue(row.created_at),
				sqlValue(row.updated_at),
				sqlValue(row.deleted_at),
			],
		});
	}
}

async function pushLocalItemChecks(
	store: HouseholdSyncFallbackStore,
	remote: RemoteSqlClient,
) {
	const result = await store.execute({
		sql: "SELECT item_id, user_id, checked_at, updated_at FROM item_checks",
	});

	for (const row of result.rows) {
		await remote.execute({
			sql: `
          INSERT INTO item_checks (item_id, user_id, checked_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(item_id, user_id) DO UPDATE SET
            checked_at = excluded.checked_at,
            updated_at = excluded.updated_at
          WHERE excluded.updated_at >= item_checks.updated_at
        `,
			args: [
				sqlValue(row.item_id),
				sqlValue(row.user_id),
				sqlValue(row.checked_at),
				sqlValue(row.updated_at),
			],
		});
	}
}

function sqlValue(value: unknown): HouseholdSqlValue {
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		value === null ||
		value instanceof ArrayBuffer
	) {
		return value;
	}

	if (value === undefined) return null;
	throw new Error("Unexpected Household SQL value");
}
