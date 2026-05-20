import * as Crypto from "expo-crypto";
import { z } from "zod";

import { sqlNumberSchema } from "@/db/utils";
import { track } from "@/lib/analytics";
import { asError } from "@/lib/errors";
import { createAppId } from "@/lib/ids";
import { logger as defaultLogger, type Logger } from "@/lib/logger";
import type { HouseholdStoreExecutor } from "@/lib/services/household";

type ItemServiceAnalytics = {
	track: typeof track;
};

export type Item = {
	id: string;
	householdId: string;
	listId: string;
	name: string;
	checked: boolean;
	checkedByUserId: string | null;
	position: number;
	createdByUserId: string;
	createdAt: number;
	updatedAt: number;
};

export type ListItemsInput = {
	listId: string;
};

export type AddItemInput = {
	listId: string;
	userId: string;
	name: string;
};

export type SetItemCheckedInput = {
	itemId: string;
	userId: string;
	checked: boolean;
};

export type ItemService = {
	listItems(input: ListItemsInput): Promise<Item[]>;
	addItem(input: AddItemInput): Promise<Item>;
	setItemChecked(input: SetItemCheckedInput): Promise<void>;
};

export type ItemServiceDeps = {
	householdId: string;
	store: HouseholdStoreExecutor;
	logger?: Logger;
	analytics?: ItemServiceAnalytics;
};

const itemRowSchema = z.object({
	id: z.string(),
	list_id: z.string(),
	name: z.string(),
	checked_by_user_id: z.string().nullable().optional(),
	checked_at: sqlNumberSchema.nullable().optional(),
	position: sqlNumberSchema,
	created_by_user_id: z.string(),
	created_at: sqlNumberSchema,
	updated_at: sqlNumberSchema,
});

let lastItemServiceTimestamp: number | null = null;

export function createItemService(deps: ItemServiceDeps): ItemService {
	const log = (deps.logger ?? defaultLogger).with({
		household_id: deps.householdId,
		service: "item",
	});
	const analytics = deps.analytics ?? { track };

	return {
		async listItems(input) {
			try {
				const result = await deps.store.execute({
					sql: `
            SELECT
              i.id,
              i.list_id,
              i.name,
              c.user_id AS checked_by_user_id,
              c.checked_at AS checked_at,
              i.position,
              i.created_by_user_id,
              i.created_at,
              i.updated_at
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
					args: [input.listId],
				});

				return result.rows.map((row) => itemFromRow(row, deps.householdId));
			} catch (error) {
				log.error("item list load failed", {
					error: asError(error),
					list_id: input.listId,
				});
				throw error;
			}
		},
		async addItem(input) {
			const name = input.name.trim();
			if (!name) {
				throw new Error("Item name is required");
			}

			try {
				const position = await nextPosition(deps.store, input.listId);
				const now = nextItemServiceTimestamp();
				const id = createAppId("itm", randomUuid);

				await deps.store.execute({
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
					args: [id, input.listId, name, position, input.userId, now, now],
				});

				const item = {
					id,
					householdId: deps.householdId,
					listId: input.listId,
					name,
					checked: false,
					checkedByUserId: null,
					position,
					createdByUserId: input.userId,
					createdAt: now,
					updatedAt: now,
				};
				analytics.track("item_added", {
					household_id: deps.householdId,
					list_id: input.listId,
					item_id: id,
					user_id: input.userId,
				});

				return item;
			} catch (error) {
				log.error("item add failed", {
					error: asError(error),
					list_id: input.listId,
				});
				throw error;
			}
		},
		async setItemChecked(input) {
			try {
				const now = nextItemServiceTimestamp();
				await deps.store.execute({
					sql: `
            INSERT INTO item_checks (item_id, user_id, checked_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(item_id, user_id) DO UPDATE SET
              checked_at = excluded.checked_at,
              updated_at = excluded.updated_at
					`,
					args: [input.itemId, input.userId, input.checked ? now : null, now],
				});
				analytics.track("item_checked_state_changed", {
					household_id: deps.householdId,
					item_id: input.itemId,
					user_id: input.userId,
					checked: input.checked,
				});
			} catch (error) {
				log.error("item checked state update failed", {
					error: asError(error),
					item_id: input.itemId,
				});
				throw error;
			}
		},
	};
}

async function nextPosition(
	store: HouseholdStoreExecutor,
	listId: string,
): Promise<number> {
	const result = await store.execute({
		sql: "SELECT COALESCE(MAX(position), -1) + 1 AS position FROM items WHERE list_id = ? AND deleted_at IS NULL",
		args: [listId],
	});
	const value = result.rows[0]?.position;
	return typeof value === "number" ? value : Number(value ?? 0);
}

function itemFromRow(row: Record<string, unknown>, householdId: string): Item {
	const parsed = itemRowSchema.parse(row);
	const checked = parsed.checked_at !== null && parsed.checked_at !== undefined;

	return {
		id: parsed.id,
		householdId,
		listId: parsed.list_id,
		name: parsed.name,
		checked,
		checkedByUserId:
			checked && parsed.checked_by_user_id ? parsed.checked_by_user_id : null,
		position: parsed.position,
		createdByUserId: parsed.created_by_user_id,
		createdAt: parsed.created_at,
		updatedAt: parsed.updated_at,
	};
}

function randomUuid(): string {
	return globalThis.crypto?.randomUUID?.() ?? Crypto.randomUUID();
}

function nextItemServiceTimestamp(): number {
	lastItemServiceTimestamp = nextMonotonicTimestamp(
		Date.now(),
		lastItemServiceTimestamp,
	);
	return lastItemServiceTimestamp;
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
