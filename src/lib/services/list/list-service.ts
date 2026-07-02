import * as Crypto from "expo-crypto";
import { z } from "zod";
import { track } from "@/client/lib/analytics";
import { asError } from "@/shared/errors";
import { createAppId } from "@/shared/ids";
import { logger as defaultLogger, type Logger } from "@/client/lib/logger";
import type { ServiceAnalytics } from "@/shared/service-analytics";
import type { ProductDatabase } from "@/client/lib/product-database";
import {
	sqlTimestampMillisSchema,
	timestampMillisToSqlText,
} from "@/lib/services/shared/sql-timestamp";
import { sqlNumberSchema } from "@/shared/sql";

export type List = {
	id: string;
	householdId: string;
	name: string;
	createdByUserId: string;
	createdAt: number;
	updatedAt: number;
	archived: boolean;
	archivedAt: number | null;
};

export type ListSummary = {
	id: string;
	householdId: string;
	name: string;
	createdByUserId: string;
	createdAt: number;
	updatedAt: number;
	archived: boolean;
	archivedAt: number | null;
	lastActivityAt: number;
	uncheckedItemCount: number;
	checkedItemCount: number;
};

export type ListListsInput = {
	archive?: "active" | "archived" | "all";
	sort?: "recentActivity" | "name" | "createdAt";
	searchText?: string;
	createdByUserId?: string;
};

export type ListNameValidationError = "required" | "tooLong";

export type CreateListInput = {
	name: string;
};

export type GetListInput = {
	listId: string;
};

export type RenameListInput = {
	listId: string;
	name: string;
};

export type DeleteListInput = {
	listId: string;
};

export type CreateListResult =
	| { status: "available"; list: List; didWrite: true }
	| { status: "invalidName"; reason: ListNameValidationError; didWrite: false };

export type GetListResult =
	| { status: "available"; list: List }
	| { status: "deleted"; listId: string; deletedAt: number; updatedAt: number }
	| { status: "missing"; listId: string };

export type RenameListResult =
	| { status: "available"; list: List; didWrite: boolean }
	| { status: "invalidName"; reason: ListNameValidationError; didWrite: false }
	| {
			status: "deleted";
			listId: string;
			deletedAt: number;
			updatedAt: number;
			didWrite: false;
	  }
	| { status: "missing"; listId: string; didWrite: false };

export type DeleteListResult =
	| {
			status: "deleted";
			listId: string;
			deletedAt: number;
			updatedAt: number;
			didWrite: boolean;
	  }
	| { status: "missing"; listId: string; didWrite: false };

export type ListService = {
	createList(input: CreateListInput): Promise<CreateListResult>;
	getList(input: GetListInput): Promise<GetListResult>;
	renameList(input: RenameListInput): Promise<RenameListResult>;
	deleteList(input: DeleteListInput): Promise<DeleteListResult>;
	listLists(input?: ListListsInput): Promise<ListSummary[]>;
};

export type ListServiceDeps = {
	householdId: string;
	userId: string;
	store: ProductDatabase;
	logger?: Logger;
	analytics?: ServiceAnalytics;
};

const LIST_NAME_MAX_LENGTH = 80;

const listRowSchema = z.object({
	id: z.string(),
	name: z.string(),
	created_by_user_id: z.string(),
	created_at: sqlTimestampMillisSchema,
	updated_at: sqlTimestampMillisSchema,
	archived_at: sqlTimestampMillisSchema.nullable(),
	deleted_at: sqlTimestampMillisSchema.nullable(),
});

type ListRow = z.infer<typeof listRowSchema>;

const listSummaryRowSchema = z.object({
	id: z.string(),
	name: z.string(),
	created_by_user_id: z.string(),
	created_at: sqlTimestampMillisSchema,
	updated_at: sqlTimestampMillisSchema,
	archived_at: sqlTimestampMillisSchema.nullable(),
	last_activity_at: sqlTimestampMillisSchema,
	unchecked_item_count: sqlNumberSchema,
	checked_item_count: sqlNumberSchema,
});

const ARCHIVE_FILTER_SQL = {
	active: "AND l.archived_at IS NULL",
	archived: "AND l.archived_at IS NOT NULL",
	all: "",
} as const;

const SORT_SQL = {
	recentActivity: "last_activity_at DESC, l.created_at ASC, l.id ASC",
	name: "l.name COLLATE NOCASE ASC, l.created_at ASC, l.id ASC",
	createdAt: "l.created_at DESC, l.id ASC",
} as const;

let lastListServiceTimestamp: number | null = null;

export function createListService(deps: ListServiceDeps): ListService {
	const log = (deps.logger ?? defaultLogger).with({
		household_id: deps.householdId,
		service: "list",
	});
	const analytics = deps.analytics ?? { track };

	return {
		async createList(input) {
			const validated = validateListName(input.name);
			if (!validated.ok) {
				return {
					status: "invalidName",
					reason: validated.reason,
					didWrite: false,
				};
			}

			try {
				const now = nextListServiceTimestamp();
				const nowText = timestampMillisToSqlText(now);
				const id = createAppId("lst", randomUuid);
				// The shared `lists` table carries household_id (each Household is no
				// longer its own DB), so the write scopes the row to the Household.
				await deps.store.writeTransaction((tx) =>
					tx.execute(
						`
              INSERT INTO lists (id, household_id, name, created_by_user_id, created_at, updated_at, archived_at, deleted_at)
              VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)
            `,
						[
							id,
							deps.householdId,
							validated.name,
							deps.userId,
							nowText,
							nowText,
						],
					),
				);
				analytics.track("list_created", analyticsProperties(deps, id));

				return {
					status: "available",
					list: {
						id,
						householdId: deps.householdId,
						name: validated.name,
						createdByUserId: deps.userId,
						createdAt: now,
						updatedAt: now,
						archived: false,
						archivedAt: null,
					},
					didWrite: true,
				};
			} catch (error) {
				log.error("list create failed", { error: asError(error) });
				throw error;
			}
		},
		async getList(input) {
			try {
				const row = await readListRow(
					deps.store,
					deps.householdId,
					input.listId,
				);
				if (!row) {
					return { status: "missing", listId: input.listId };
				}
				if (row.deleted_at !== null) {
					return {
						status: "deleted",
						listId: input.listId,
						deletedAt: row.deleted_at,
						updatedAt: row.updated_at,
					};
				}

				return {
					status: "available",
					list: listFromRow(row, deps.householdId),
				};
			} catch (error) {
				log.error("list metadata load failed", {
					error: asError(error),
					list_id: input.listId,
				});
				throw error;
			}
		},
		async renameList(input) {
			const validated = validateListName(input.name);
			if (!validated.ok) {
				return {
					status: "invalidName",
					reason: validated.reason,
					didWrite: false,
				};
			}

			try {
				const row = await readListRow(
					deps.store,
					deps.householdId,
					input.listId,
				);
				if (!row) {
					return { status: "missing", listId: input.listId, didWrite: false };
				}
				if (row.deleted_at !== null) {
					return {
						status: "deleted",
						listId: input.listId,
						deletedAt: row.deleted_at,
						updatedAt: row.updated_at,
						didWrite: false,
					};
				}
				if (row.name === validated.name) {
					return {
						status: "available",
						list: listFromRow(row, deps.householdId),
						didWrite: false,
					};
				}

				const now = nextListServiceTimestamp();
				// `AND deleted_at IS NULL` guards the read-then-write race: a delete
				// interleaved after the pre-read must not resurrect or rename the
				// tombstoned row. PowerSync's local tables are views, so rowsAffected
				// is always 0; we re-read and classify by the row's lifecycle. A live
				// row after this guarded UPDATE on the serialized connection carries
				// the new name (didWrite), while a tombstoned or vanished row
				// reclassifies the lost race. The Household scope blocks renaming
				// another Household's List.
				await deps.store.writeTransaction((tx) =>
					tx.execute(
						"UPDATE lists SET name = ?, updated_at = ? WHERE id = ? AND household_id = ? AND deleted_at IS NULL",
						[
							validated.name,
							timestampMillisToSqlText(now),
							input.listId,
							deps.householdId,
						],
					),
				);
				const writtenRow = await readListRow(
					deps.store,
					deps.householdId,
					input.listId,
				);
				if (!writtenRow || writtenRow.deleted_at !== null) {
					return reclassifyLostWrite(
						deps.store,
						deps.householdId,
						input.listId,
					);
				}
				analytics.track(
					"list_renamed",
					analyticsProperties(deps, input.listId),
				);

				return {
					status: "available",
					list: {
						...listFromRow(writtenRow, deps.householdId),
						name: validated.name,
						updatedAt: now,
					},
					didWrite: true,
				};
			} catch (error) {
				log.error("list rename failed", {
					error: asError(error),
					list_id: input.listId,
				});
				throw error;
			}
		},
		async deleteList(input) {
			try {
				const row = await readListRow(
					deps.store,
					deps.householdId,
					input.listId,
				);
				if (!row) {
					return { status: "missing", listId: input.listId, didWrite: false };
				}
				if (row.deleted_at !== null) {
					return {
						status: "deleted",
						listId: input.listId,
						deletedAt: row.deleted_at,
						updatedAt: row.updated_at,
						didWrite: false,
					};
				}

				const now = nextListServiceTimestamp();
				const nowText = timestampMillisToSqlText(now);
				// `AND deleted_at IS NULL` keeps a concurrent delete from churning the
				// tombstone timestamps. PowerSync's local tables are views, so
				// rowsAffected is always 0; we re-read instead. deleted_at is
				// write-once under the guard, so a tombstone equal to our `now` means
				// our write won the race (didWrite); any other tombstone is a lost
				// race, and a vanished row is missing.
				await deps.store.writeTransaction((tx) =>
					tx.execute(
						"UPDATE lists SET deleted_at = ?, updated_at = ? WHERE id = ? AND household_id = ? AND deleted_at IS NULL",
						[nowText, nowText, input.listId, deps.householdId],
					),
				);
				const deletedRow = await readListRow(
					deps.store,
					deps.householdId,
					input.listId,
				);
				if (deletedRow?.deleted_at != null) {
					const didWrite = deletedRow.deleted_at === now;
					if (didWrite) {
						analytics.track(
							"list_deleted",
							analyticsProperties(deps, input.listId),
						);
					}
					return {
						status: "deleted",
						listId: input.listId,
						deletedAt: deletedRow.deleted_at,
						updatedAt: deletedRow.updated_at,
						didWrite,
					};
				}

				return { status: "missing", listId: input.listId, didWrite: false };
			} catch (error) {
				log.error("list delete failed", {
					error: asError(error),
					list_id: input.listId,
				});
				throw error;
			}
		},
		async listLists(input) {
			const archive = input?.archive ?? "active";
			const sort = input?.sort ?? "recentActivity";
			const conditions = [
				"l.household_id = ?",
				"AND l.deleted_at IS NULL",
				ARCHIVE_FILTER_SQL[archive],
			];
			const args: unknown[] = [deps.householdId];

			const searchText = input?.searchText?.trim() ?? "";
			if (searchText) {
				conditions.push("AND l.name LIKE ? ESCAPE '\\'");
				args.push(`%${escapeLikePattern(searchText)}%`);
			}
			if (input?.createdByUserId !== undefined) {
				conditions.push("AND l.created_by_user_id = ?");
				args.push(input.createdByUserId);
			}

			try {
				// item_checks is one shared row per Item (Decision 9), so the plain
				// join replaces the old latest-row subquery. Timestamps are ISO text,
				// so last_activity_at uses the scalar MAX over text with '' as the
				// "no activity" floor (ISO-8601 sorts lexicographically = chronologically).
				const rows = await deps.store.getAll(
					`
            SELECT
              l.id,
              l.name,
              l.created_by_user_id,
              l.created_at,
              l.updated_at,
              l.archived_at,
              MAX(
                l.updated_at,
                COALESCE(MAX(i.updated_at), ''),
                COALESCE(MAX(c.updated_at), '')
              ) AS last_activity_at,
              COALESCE(
                SUM(CASE WHEN i.id IS NOT NULL AND c.checked_at IS NULL THEN 1 ELSE 0 END),
                0
              ) AS unchecked_item_count,
              COALESCE(
                SUM(CASE WHEN c.checked_at IS NOT NULL THEN 1 ELSE 0 END),
                0
              ) AS checked_item_count
            FROM lists l
            LEFT JOIN items i ON i.list_id = l.id AND i.deleted_at IS NULL
            LEFT JOIN item_checks c ON c.item_id = i.id
            WHERE ${conditions.filter(Boolean).join(" ")}
            GROUP BY l.id
            ORDER BY ${SORT_SQL[sort]}
          `,
					args,
				);

				return rows.map((row) =>
					listSummaryFromRow(listSummaryRowSchema.parse(row), deps.householdId),
				);
			} catch (error) {
				log.error("list summaries load failed", { error: asError(error) });
				throw error;
			}
		},
	};
}

/**
 * A guarded lifecycle UPDATE (`AND deleted_at IS NULL`) matched no row: the
 * List was deleted (or vanished) between the pre-read and the write. Re-read
 * and return the typed lifecycle result; no write happened, so callers emit
 * no analytics for it.
 */
async function reclassifyLostWrite(
	store: ProductDatabase,
	householdId: string,
	listId: string,
): Promise<
	| {
			status: "deleted";
			listId: string;
			deletedAt: number;
			updatedAt: number;
			didWrite: false;
	  }
	| { status: "missing"; listId: string; didWrite: false }
> {
	const row = await readListRow(store, householdId, listId);
	if (row?.deleted_at != null) {
		return {
			status: "deleted",
			listId,
			deletedAt: row.deleted_at,
			updatedAt: row.updated_at,
			didWrite: false,
		};
	}

	return { status: "missing", listId, didWrite: false };
}

async function readListRow(
	store: ProductDatabase,
	householdId: string,
	listId: string,
): Promise<ListRow | null> {
	const row = await store.getOptional(
		`
      SELECT id, name, created_by_user_id, created_at, updated_at, archived_at, deleted_at
      FROM lists
      WHERE id = ? AND household_id = ?
      LIMIT 1
    `,
		[listId, householdId],
	);
	return row ? listRowSchema.parse(row) : null;
}

function listSummaryFromRow(
	row: z.infer<typeof listSummaryRowSchema>,
	householdId: string,
): ListSummary {
	return {
		id: row.id,
		householdId,
		name: row.name,
		createdByUserId: row.created_by_user_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		archived: row.archived_at !== null,
		archivedAt: row.archived_at,
		lastActivityAt: row.last_activity_at,
		uncheckedItemCount: row.unchecked_item_count,
		checkedItemCount: row.checked_item_count,
	};
}

function escapeLikePattern(value: string): string {
	return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function listFromRow(row: ListRow, householdId: string): List {
	return {
		id: row.id,
		householdId,
		name: row.name,
		createdByUserId: row.created_by_user_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		archived: row.archived_at !== null,
		archivedAt: row.archived_at,
	};
}

function validateListName(
	rawName: string,
): { ok: true; name: string } | { ok: false; reason: ListNameValidationError } {
	const name = rawName.trim();
	if (!name) {
		return { ok: false, reason: "required" };
	}
	if (name.length > LIST_NAME_MAX_LENGTH) {
		return { ok: false, reason: "tooLong" };
	}

	return { ok: true, name };
}

function analyticsProperties(deps: ListServiceDeps, listId: string) {
	return {
		household_id: deps.householdId,
		list_id: listId,
		user_id: deps.userId,
	};
}

function randomUuid(): string {
	return globalThis.crypto?.randomUUID?.() ?? Crypto.randomUUID();
}

function nextListServiceTimestamp(): number {
	lastListServiceTimestamp = nextMonotonicTimestamp(
		Date.now(),
		lastListServiceTimestamp,
	);
	return lastListServiceTimestamp;
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
