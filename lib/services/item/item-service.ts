import * as Crypto from "expo-crypto";
import { z } from "zod";
import { sqlNumberSchema } from "@/db/utils";
import { track } from "@/lib/analytics";
import { asError } from "@/lib/errors";
import { createAppId } from "@/lib/ids";
import { logger as defaultLogger, type Logger } from "@/lib/logger";
import type { ServiceAnalytics } from "@/lib/services/analytics";
import type { ProductDataStore } from "@/lib/services/shared/product-data-store";
import {
	sqlTimestampMillisSchema,
	timestampMillisToSqlText,
} from "@/lib/services/shared/sql-timestamp";

export type Item = {
	id: string;
	householdId: string;
	listId: string;
	name: string;
	quantity: string | null;
	notes: string | null;
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
	quantity: string | null;
	notes: string | null;
};

export type SetItemCheckedInput = {
	listId: string;
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
	store: ProductDataStore;
	logger?: Logger;
	analytics?: ServiceAnalytics;
};

const itemRowSchema = z.object({
	id: z.string(),
	list_id: z.string(),
	name: z.string(),
	quantity: z.string().nullable(),
	notes: z.string().nullable(),
	checked_by_user_id: z.string().nullable().optional(),
	checked_at: sqlTimestampMillisSchema.nullable().optional(),
	position: sqlNumberSchema,
	created_by_user_id: z.string(),
	created_at: sqlTimestampMillisSchema,
	updated_at: sqlTimestampMillisSchema,
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
				const rows = await deps.store.getAll(
					`
						SELECT
							i.id,
							i.list_id,
							i.name,
							i.quantity,
							i.notes,
							c.checked_by_user_id AS checked_by_user_id,
							c.checked_at AS checked_at,
							i.position,
							i.created_by_user_id,
							i.created_at,
							i.updated_at
						FROM items i
						JOIN lists l ON l.id = i.list_id
						LEFT JOIN item_checks c ON c.id = (
							SELECT c2.id
							FROM item_checks c2
							WHERE c2.item_id = i.id
							ORDER BY c2.updated_at DESC, c2.id DESC
							LIMIT 1
						)
						WHERE l.household_id = ?
							AND i.list_id = ?
							AND i.deleted_at IS NULL
						ORDER BY i.position ASC, i.created_at ASC, i.id ASC
					`,
					[deps.householdId, input.listId],
				);

				return rows.map((row) => itemFromRow(row, deps.householdId));
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
			const quantity = nullableTrimmed(input.quantity);
			const notes = nullableTrimmed(input.notes);

			try {
				const now = nextItemServiceTimestamp();
				const nowSql = timestampMillisToSqlText(now);
				const id = createAppId("itm", randomUuid);
				const writeResult = await deps.store.writeTransaction((tx) =>
					tx.execute(
						`
							INSERT INTO items (
								id,
								list_id,
								name,
								quantity,
								notes,
								position,
								created_by_user_id,
								created_at,
								updated_at,
								deleted_at
							)
							SELECT
								?,
								l.id,
								?,
								?,
								?,
								(
									SELECT COALESCE(MAX(position), -1) + 1
									FROM items
									WHERE list_id = l.id AND deleted_at IS NULL
								),
								?,
								?,
								?,
								NULL
							FROM lists l
							WHERE l.id = ?
								AND l.household_id = ?
								AND l.deleted_at IS NULL
								AND l.archived_at IS NULL
							RETURNING position
						`,
						[
							id,
							name,
							quantity,
							notes,
							input.userId,
							nowSql,
							nowSql,
							input.listId,
							deps.householdId,
						],
					),
				);
				const row = writeResult.rows[0];
				if (!row) {
					throw new Error("List is not active");
				}
				const position = sqlNumberSchema.parse(row.position);

				const item = {
					id,
					householdId: deps.householdId,
					listId: input.listId,
					name,
					quantity,
					notes,
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
				const nowSql = timestampMillisToSqlText(now);
				const checkedAt = input.checked ? nowSql : null;
				const writeResult = await deps.store.writeTransaction((tx) =>
					tx.execute(
						`
							INSERT INTO item_checks (
								id,
								item_id,
								checked_at,
								checked_by_user_id,
								updated_at
							)
							SELECT
								COALESCE(
									(
										SELECT c.id
										FROM item_checks c
										WHERE c.item_id = i.id
										ORDER BY c.updated_at DESC, c.id DESC
										LIMIT 1
									),
									i.id
								),
								i.id,
								?,
								?,
								?
							FROM items i
							JOIN lists l ON l.id = i.list_id
							WHERE i.id = ?
								AND i.list_id = ?
								AND i.deleted_at IS NULL
								AND l.household_id = ?
								AND l.deleted_at IS NULL
								AND l.archived_at IS NULL
							ON CONFLICT(id) DO UPDATE SET
								checked_at = excluded.checked_at,
								checked_by_user_id = excluded.checked_by_user_id,
								updated_at = excluded.updated_at
							RETURNING id
						`,
						[
							checkedAt,
							input.userId,
							nowSql,
							input.itemId,
							input.listId,
							deps.householdId,
						],
					),
				);
				if (!writeResult.rows[0]) {
					throw new Error("Item not found in List");
				}
				analytics.track("item_checked_state_changed", {
					household_id: deps.householdId,
					list_id: input.listId,
					item_id: input.itemId,
					user_id: input.userId,
					checked: input.checked,
				});
			} catch (error) {
				log.error("item checked state update failed", {
					error: asError(error),
					list_id: input.listId,
					item_id: input.itemId,
				});
				throw error;
			}
		},
	};
}

function itemFromRow(row: Record<string, unknown>, householdId: string): Item {
	const parsed = itemRowSchema.parse(row);
	const checked = parsed.checked_at !== null && parsed.checked_at !== undefined;

	return {
		id: parsed.id,
		householdId,
		listId: parsed.list_id,
		name: parsed.name,
		quantity: parsed.quantity,
		notes: parsed.notes,
		checked,
		checkedByUserId:
			checked && parsed.checked_by_user_id ? parsed.checked_by_user_id : null,
		position: parsed.position,
		createdByUserId: parsed.created_by_user_id,
		createdAt: parsed.created_at,
		updatedAt: parsed.updated_at,
	};
}

function nullableTrimmed(value: string | null | undefined): string | null {
	const trimmed = value?.trim() ?? "";
	return trimmed ? trimmed : null;
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
