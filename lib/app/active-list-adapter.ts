import * as Crypto from "expo-crypto";

import type {
	ActiveListDataAdapter,
	ActiveListItem,
	ActiveListSyncResult,
} from "@/components/active-list";
import {
	type HouseholdDatabaseConfig,
	type HouseholdDb,
	type HouseholdSqlValue,
	type OpenHouseholdDbConfig,
	openHouseholdDb,
} from "@/lib/app/household-db";
import type { BootstrapResponse } from "@/lib/bootstrap";
import { createAppId, type RandomUuid } from "@/lib/ids";
import { logger } from "@/lib/logger";

type ActiveListDb = {
	syncAuthorized?: boolean;
	execute: (
		statement: Parameters<HouseholdDb["execute"]>[0],
	) => Promise<{ rows: Array<Record<string, unknown>> }>;
	pull?: () => Promise<ActiveListSyncResult>;
	sync?: () => Promise<ActiveListSyncResult>;
	close: () => void | Promise<void>;
};

type RemoteSqlClient = {
	execute: (statement: {
		sql: string;
		args?: HouseholdSqlValue[];
	}) => Promise<unknown>;
	close?: () => void;
};

export type HouseholdActiveListAdapterConfig = {
	household: BootstrapResponse["activeHousehold"];
	activeMember: BootstrapResponse["activeMember"];
	list: BootstrapResponse["activeList"];
	currentUser: BootstrapResponse["user"];
	members: BootstrapResponse["members"];
	database: HouseholdDatabaseConfig;
};

type AdapterOptions = {
	db?: ActiveListDb;
	openDb?: (config: OpenHouseholdDbConfig) => Promise<ActiveListDb>;
	openRemoteClient?: (
		database: RequiredRemoteDatabaseConfig,
	) => RemoteSqlClient | Promise<RemoteSqlClient>;
	now?: () => number;
	randomUuid?: RandomUuid;
};

type RequiredRemoteDatabaseConfig = {
	url: string;
	authToken: string;
};

let lastAppTimestamp: number | null = null;

export function createHouseholdActiveListAdapter(
	config: HouseholdActiveListAdapterConfig,
	options: AdapterOptions = {},
): ActiveListDataAdapter {
	const dbPromise = options.db
		? Promise.resolve(options.db)
		: (options.openDb ?? openHouseholdDb)({
				householdId: config.household.id,
				database: config.database,
			});
	const ownsDb = !options.db;
	const now = createTimestampSource(options.now);
	const randomUuid = options.randomUuid ?? Crypto.randomUUID;
	const memberNames = new Map<string, string | null>();
	const log = logger.with({
		household_id: config.household.id,
		list_id: config.list.id,
		feature: "active_list",
	});
	const syncAuthorized = options.db
		? Boolean(options.db.syncAuthorized && options.db.pull && options.db.sync)
		: Boolean(config.database.url && config.database.authToken);
	let closed = false;

	for (const member of config.members) {
		memberNames.set(member.userId, member.displayName);
	}
	memberNames.set(
		config.activeMember.userId,
		config.activeMember.displayName ?? config.currentUser.displayName,
	);

	return {
		syncAuthorized,
		async load() {
			try {
				const db = await dbPromise;
				const listResult = await db.execute({
					sql: "SELECT name FROM lists WHERE id = ? AND deleted_at IS NULL LIMIT 1",
					args: [config.list.id],
				});
				const listName = stringColumn(listResult.rows[0]?.name, "list name");
				const result = await db.execute({
					sql: `
          SELECT
            i.id,
            i.name,
            c.user_id AS checked_by_user_id,
            c.checked_at AS checked_at
          FROM items i
          LEFT JOIN item_checks c ON c.rowid = (
            SELECT c2.rowid
            FROM item_checks c2
            WHERE c2.item_id = i.id
            ORDER BY c2.updated_at DESC, c2.user_id DESC
            LIMIT 1
          )
          WHERE i.list_id = ? AND i.deleted_at IS NULL
          ORDER BY i.position ASC, i.created_at ASC, i.id ASC
        `,
					args: [config.list.id],
				});

				return {
					householdName: config.household.name,
					listName,
					items: result.rows.map((row) => itemFromRow(row, memberNames)),
				};
			} catch (error) {
				log.error("active list load failed", { error: asError(error) });
				throw error;
			}
		},
		async addItem(rawName) {
			try {
				const db = await dbPromise;
				const name = rawName.trim();
				if (!name) {
					throw new Error("Item name is required");
				}

				const position = await nextPosition(db, config.list.id);
				const id = createAppId("itm", randomUuid);
				const timestamp = now();

				await db.execute({
					sql: `
          INSERT INTO items (
            id,
            list_id,
            name,
            position,
            created_by_user_id,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
					args: [
						id,
						config.list.id,
						name,
						position,
						config.activeMember.userId,
						timestamp,
						timestamp,
					],
				});

				return { id, name, checked: false, checkedByMemberName: null };
			} catch (error) {
				log.error("active list item add failed", { error: asError(error) });
				throw error;
			}
		},
		async setItemChecked(itemId, checked) {
			try {
				const db = await dbPromise;
				const timestamp = now();
				await db.execute({
					sql: `
          INSERT INTO item_checks (item_id, user_id, checked_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(item_id, user_id) DO UPDATE SET
            checked_at = excluded.checked_at,
            updated_at = excluded.updated_at
        `,
					args: [
						itemId,
						config.activeMember.userId,
						checked ? timestamp : null,
						timestamp,
					],
				});
			} catch (error) {
				log.error("active list item check failed", {
					error: asError(error),
					item_id: itemId,
				});
				throw error;
			}
		},
		async pull() {
			if (!syncAuthorized) return { changed: false };

			try {
				const db = await dbPromise;
				return db.pull ? await db.pull() : { changed: false };
			} catch (error) {
				log.error("active list pull failed", { error: asError(error) });
				throw error;
			}
		},
		async sync() {
			if (!syncAuthorized) return { changed: false };

			const db = await dbPromise;
			try {
				return db.sync ? await db.sync() : { changed: false };
			} catch (error) {
				log.error("active list native sync failed", { error: asError(error) });
				try {
					await pushLocalRowsToRemote(
						db,
						config.database,
						options.openRemoteClient,
					);
					log.warn("active list sync fallback succeeded");
				} catch (fallbackError) {
					log.error("active list sync fallback failed", {
						error: asError(fallbackError),
					});
					throw fallbackError;
				}
				return { changed: false };
			}
		},
		async close() {
			if (!ownsDb || closed) return;
			closed = true;
			const db = await dbPromise.catch(() => null);
			try {
				await db?.close();
			} catch (error) {
				log.error("active list db close failed", { error: asError(error) });
				throw error;
			}
		},
	};
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

async function pushLocalRowsToRemote(
	db: ActiveListDb,
	database: HouseholdDatabaseConfig,
	openRemoteClient: (
		database: RequiredRemoteDatabaseConfig,
	) => RemoteSqlClient | Promise<RemoteSqlClient> = openLibsqlRemoteClient,
) {
	if (!database.url || !database.authToken) {
		throw new Error("Household DB sync requires remote credentials");
	}

	const remote = await openRemoteClient({
		url: database.url,
		authToken: database.authToken,
	});

	try {
		await pushLocalLists(db, remote);
		await pushLocalItems(db, remote);
		await pushLocalItemChecks(db, remote);
	} finally {
		remote.close?.();
	}
}

async function openLibsqlRemoteClient(database: RequiredRemoteDatabaseConfig) {
	const { createClient } = await import("@libsql/client/web");
	return createClient({ url: database.url, authToken: database.authToken });
}

async function pushLocalLists(db: ActiveListDb, remote: RemoteSqlClient) {
	const result = await db.execute({
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

async function pushLocalItems(db: ActiveListDb, remote: RemoteSqlClient) {
	const result = await db.execute({
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

async function pushLocalItemChecks(db: ActiveListDb, remote: RemoteSqlClient) {
	const result = await db.execute({
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

function createTimestampSource(now?: () => number): () => number {
	if (!now) {
		return nextAppTimestamp;
	}

	let lastTimestamp: number | null = null;

	return () => {
		lastTimestamp = nextMonotonicTimestamp(now(), lastTimestamp);
		return lastTimestamp;
	};
}

function nextAppTimestamp(): number {
	lastAppTimestamp = nextMonotonicTimestamp(Date.now(), lastAppTimestamp);
	return lastAppTimestamp;
}

function nextMonotonicTimestamp(
	rawTimestamp: number,
	previousTimestamp: number | null,
): number {
	const timestamp = Math.trunc(rawTimestamp);
	if (!Number.isFinite(timestamp)) {
		throw new Error("Timestamp source must return a finite number");
	}

	return previousTimestamp === null || timestamp > previousTimestamp
		? timestamp
		: previousTimestamp + 1;
}

async function nextPosition(db: ActiveListDb, listId: string): Promise<number> {
	const result = await db.execute({
		sql: "SELECT COALESCE(MAX(position), -1) + 1 AS position FROM items WHERE list_id = ? AND deleted_at IS NULL",
		args: [listId],
	});
	const value = result.rows[0]?.position;
	return typeof value === "number" ? value : Number(value ?? 0);
}

function itemFromRow(
	row: Record<string, unknown>,
	memberNames: Map<string, string | null>,
): ActiveListItem {
	const id = stringColumn(row.id, "id");
	const name = stringColumn(row.name, "name");
	const checkedByUserId = nullableStringColumn(row.checked_by_user_id);
	const checked = row.checked_at !== null && row.checked_at !== undefined;

	return {
		id,
		name,
		checked,
		checkedByMemberName:
			checked && checkedByUserId
				? (memberNames.get(checkedByUserId) ?? null)
				: null,
	};
}

function stringColumn(value: unknown, column: string): string {
	if (typeof value !== "string") {
		throw new Error(`Expected ${column} to be a string`);
	}
	return value;
}

function nullableStringColumn(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}
