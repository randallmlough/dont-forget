import { createClient } from "@libsql/client/web";
import * as Crypto from "expo-crypto";

import type {
	ActiveListDataAdapter,
	ActiveListItem,
} from "@/components/active-list";
import type { BootstrapResponse } from "@/lib/bootstrap";
import { createAppId, type RandomUuid } from "@/lib/ids";

type ExecuteResult = {
	rows: Array<Record<string, unknown>>;
};

type ActiveListClient = {
	execute: (
		statement: string | { sql: string; args?: Array<string | number | null> },
	) => Promise<ExecuteResult>;
	close?: () => void | Promise<void>;
};

export type RemoteActiveListAdapterConfig = {
	household: BootstrapResponse["activeHousehold"];
	list: BootstrapResponse["activeList"];
	currentUser: BootstrapResponse["user"];
	members: BootstrapResponse["members"];
	database: BootstrapResponse["householdDatabase"];
};

type AdapterOptions = {
	client?: ActiveListClient;
	now?: () => number;
	randomUuid?: RandomUuid;
};

export function createRemoteActiveListAdapter(
	config: RemoteActiveListAdapterConfig,
	options: AdapterOptions = {},
): ActiveListDataAdapter {
	const client =
		options.client ??
		createClient({
			url: config.database.url,
			authToken: config.database.authToken,
		});
	const ownsClient = !options.client;
	const now = options.now ?? Date.now;
	const randomUuid = options.randomUuid ?? Crypto.randomUUID;
	const memberNames = new Map<string, string | null>();
	let closed = false;

	for (const member of config.members) {
		memberNames.set(member.userId, member.displayName);
	}
	memberNames.set(config.currentUser.id, config.currentUser.displayName);

	return {
		async load() {
			const result = await client.execute({
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
				listName: config.list.name,
				items: result.rows.map((row) => itemFromRow(row, memberNames)),
			};
		},
		async addItem(rawName) {
			const name = rawName.trim();
			if (!name) {
				throw new Error("Item name is required");
			}

			const position = await nextPosition(client, config.list.id);
			const id = createAppId("itm", randomUuid);
			const timestamp = now();

			await client.execute({
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
					config.currentUser.id,
					timestamp,
					timestamp,
				],
			});

			return { id, name, checked: false, checkedByMemberName: null };
		},
		async setItemChecked(itemId, checked) {
			const timestamp = now();
			await client.execute({
				sql: `
          INSERT INTO item_checks (item_id, user_id, checked_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(item_id, user_id) DO UPDATE SET
            checked_at = excluded.checked_at,
            updated_at = excluded.updated_at
        `,
				args: [
					itemId,
					config.currentUser.id,
					checked ? timestamp : null,
					timestamp,
				],
			});
		},
		async close() {
			if (!ownsClient || closed) return;
			closed = true;
			await client.close?.();
		},
	};
}

async function nextPosition(
	client: ActiveListClient,
	listId: string,
): Promise<number> {
	const result = await client.execute({
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
