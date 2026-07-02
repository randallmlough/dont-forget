import * as Crypto from "expo-crypto";
import { z } from "zod";
import {
	sqlTimestampMillisSchema,
	timestampMillisToSqlText,
} from "@/client/features/list/sql-timestamp";
import { track } from "@/client/lib/analytics";
import { logger as defaultLogger, type Logger } from "@/client/lib/logger";
import type { ProductDatabase } from "@/client/lib/product-database";
import { asError } from "@/shared/errors";
import { createAppId } from "@/shared/ids";
import type { ServiceAnalytics } from "@/shared/service-analytics";
import { sqlNumberSchema } from "@/shared/sql";

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
	store: ProductDatabase;
	logger?: Logger;
	analytics?: ServiceAnalytics;
};

const itemRowSchema = z.object({
	id: z.string(),
	list_id: z.string(),
	name: z.string(),
	quantity: z.string().nullable(),
	notes: z.string().nullable(),
	checked_by_user_id: z.string().nullable(),
	checked_at: sqlTimestampMillisSchema.nullable(),
	position: sqlNumberSchema,
	created_by_user_id: z.string(),
	created_at: sqlTimestampMillisSchema,
	updated_at: sqlTimestampMillisSchema,
});

const checkTargetRowSchema = z.object({
	check_id: z.string().nullable(),
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
				// The PowerSync local DB holds every Household the User syncs, so the
				// join to `lists` scopes the read to the active Household. item_checks
				// is one shared row per Item (Decision 9, `item_id` unique), so a plain
				// LEFT JOIN reads the attributed check directly — no latest-row subquery.
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
            LEFT JOIN item_checks c ON c.item_id = i.id
            WHERE l.household_id = ? AND i.list_id = ? AND i.deleted_at IS NULL
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
				const nowText = timestampMillisToSqlText(now);
				const id = createAppId("itm", randomUuid);
				// Selecting FROM the guarded lists row makes the insert and the List
				// lifecycle check one statement: a delete tombstone or archive flag
				// synced in after any pre-read cannot land an Item under a List that
				// Home's active flow excludes. PowerSync's local tables are views, so
				// rowsAffected is always 0; the read-back below (the app-generated id
				// is unique) confirms the insert landed — a missing row means no
				// active List matched. The Household scope blocks writing into
				// another Household's List.
				const position = await deps.store.writeTransaction(async (tx) => {
					await tx.execute(
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
            `,
						[
							id,
							name,
							quantity,
							notes,
							input.userId,
							nowText,
							nowText,
							input.listId,
							deps.householdId,
						],
					);
					const row = await tx.getOptional(
						"SELECT position FROM items WHERE id = ? LIMIT 1",
						[id],
					);
					if (!row) {
						throw new Error("List is not active");
					}
					return sqlNumberSchema.parse(row.position);
				});

				const item: Item = {
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
				const nowText = timestampMillisToSqlText(now);
				const checkedAt = input.checked ? nowText : null;
				await deps.store.writeTransaction(async (tx) => {
					// Guarded lookup in one statement: the Item must be live, in this
					// List, in an active List, in this Household. The LEFT JOIN reports
					// whether a shared check row already exists so we PATCH it instead of
					// inserting a duplicate (Decision 9: one check per Item). PowerSync's
					// local tables are views, so we read-then-write rather than relying on
					// an ON CONFLICT upsert (unsupported on views).
					const target = await tx.getOptional(
						`
              SELECT c.id AS check_id
              FROM items i
              JOIN lists l ON l.id = i.list_id
              LEFT JOIN item_checks c ON c.item_id = i.id
              WHERE i.id = ?
                AND i.list_id = ?
                AND l.household_id = ?
                AND i.deleted_at IS NULL
                AND l.deleted_at IS NULL
                AND l.archived_at IS NULL
              LIMIT 1
            `,
						[input.itemId, input.listId, deps.householdId],
					);
					if (!target) {
						throw new Error("Item not found in List");
					}
					const { check_id } = checkTargetRowSchema.parse(target);

					// Uncheck keeps the row and clears checked_at (tombstone, never
					// delete — ADR-0002); checked_by_user_id records the latest actor on
					// every toggle. LWW orders by the app-owned updated_at.
					if (check_id !== null) {
						await tx.execute(
							`
                UPDATE item_checks
                SET checked_at = ?, checked_by_user_id = ?, updated_at = ?
                WHERE item_id = ?
              `,
							[checkedAt, input.userId, nowText, input.itemId],
						);
					} else {
						await tx.execute(
							`
                INSERT INTO item_checks (id, item_id, checked_at, checked_by_user_id, updated_at)
                VALUES (?, ?, ?, ?, ?)
              `,
							[
								`chk_${input.itemId}`,
								input.itemId,
								checkedAt,
								input.userId,
								nowText,
							],
						);
					}
				});
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
	const checked = parsed.checked_at !== null;

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
