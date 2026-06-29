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
	store: ProductDataStore;
	logger?: Logger;
	analytics?: ServiceAnalytics;
};

const LIST_NAME_MAX_LENGTH = 80;
const ZERO_ACTIVITY_AT = "1970-01-01T00:00:00.000Z";

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
	active: "l.archived_at IS NULL",
	archived: "l.archived_at IS NOT NULL",
	all: "",
} as const;

const SORT_SQL = {
	recentActivity: "last_activity_at DESC, l.created_at ASC, l.id ASC",
	name: "LOWER(l.name) ASC, l.created_at ASC, l.id ASC",
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
				const nowSql = timestampMillisToSqlText(now);
				const id = createAppId("lst", randomUuid);
				const writeResult = await deps.store.writeTransaction((tx) =>
					tx.execute(
						`
							INSERT INTO lists (
								id,
								household_id,
								name,
								created_by_user_id,
								created_at,
								updated_at,
								archived_at,
								deleted_at
							)
							VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)
							RETURNING id
						`,
						[id, deps.householdId, validated.name, deps.userId, nowSql, nowSql],
					),
				);
				if (!writeResult.rows[0]) {
					throw new Error("List was not created");
				}
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
				const nowSql = timestampMillisToSqlText(now);
				const writeResult = await deps.store.writeTransaction((tx) =>
					tx.execute(
						`
							UPDATE lists
							SET name = ?, updated_at = ?
							WHERE id = ?
								AND household_id = ?
								AND deleted_at IS NULL
							RETURNING id
						`,
						[validated.name, nowSql, input.listId, deps.householdId],
					),
				);
				if (!writeResult.rows[0]) {
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
						...listFromRow(row, deps.householdId),
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
				const nowSql = timestampMillisToSqlText(now);
				const writeResult = await deps.store.writeTransaction((tx) =>
					tx.execute(
						`
							UPDATE lists
							SET deleted_at = ?, updated_at = ?
							WHERE id = ?
								AND household_id = ?
								AND deleted_at IS NULL
							RETURNING id
						`,
						[nowSql, nowSql, input.listId, deps.householdId],
					),
				);
				if (!writeResult.rows[0]) {
					return reclassifyLostWrite(
						deps.store,
						deps.householdId,
						input.listId,
					);
				}
				analytics.track(
					"list_deleted",
					analyticsProperties(deps, input.listId),
				);

				return {
					status: "deleted",
					listId: input.listId,
					deletedAt: now,
					updatedAt: now,
					didWrite: true,
				};
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
			const conditions = ["l.household_id = ?", "l.deleted_at IS NULL"];
			const args: unknown[] = [deps.householdId];
			const archiveCondition = ARCHIVE_FILTER_SQL[archive];
			if (archiveCondition) conditions.push(archiveCondition);

			const searchText = input?.searchText?.trim() ?? "";
			if (searchText) {
				conditions.push("l.name LIKE ? ESCAPE '\\'");
				args.push(`%${escapeLikePattern(searchText)}%`);
			}
			if (input?.createdByUserId !== undefined) {
				conditions.push("l.created_by_user_id = ?");
				args.push(input.createdByUserId);
			}

			try {
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
								COALESCE(MAX(i.updated_at), ?),
								COALESCE(MAX(c.updated_at), ?)
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
						LEFT JOIN item_checks c ON c.id = (
							SELECT c2.id
							FROM item_checks c2
							WHERE c2.item_id = i.id
							ORDER BY c2.updated_at DESC, c2.id DESC
							LIMIT 1
						)
						WHERE ${conditions.join(" AND ")}
						GROUP BY l.id
						ORDER BY ${SORT_SQL[sort]}
					`,
					[ZERO_ACTIVITY_AT, ZERO_ACTIVITY_AT, ...args],
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

async function reclassifyLostWrite(
	store: ProductDataStore,
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
	store: ProductDataStore,
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
