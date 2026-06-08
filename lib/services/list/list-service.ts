import * as Crypto from "expo-crypto";
import { z } from "zod";

import { sqlNumberSchema } from "@/db/utils";
import { track } from "@/lib/analytics";
import { asError } from "@/lib/errors";
import { createAppId } from "@/lib/ids";
import { logger as defaultLogger, type Logger } from "@/lib/logger";
import type { ServiceAnalytics } from "@/lib/services/analytics";
import type {
	HouseholdSqlValue,
	HouseholdStoreExecutor,
} from "@/lib/services/household";

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

export type ListNameValidationError = "required" | "tooLong";

export type CreateListInput = {
	name: string;
};

export type GetListInput = {
	listId: string;
};

export type ListListsInput = {
	archive?: "active" | "archived" | "all";
	sort?: "recentActivity" | "name" | "createdAt";
	searchText?: string;
	createdByUserId?: string;
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

export type RenameListInput = {
	listId: string;
	name: string;
};

export type DeleteListInput = {
	listId: string;
};

export type CreateListResult =
	| { status: "available"; list: List; didWrite: true }
	| {
			status: "invalidName";
			reason: ListNameValidationError;
			didWrite: false;
	  };

export type GetListResult =
	| { status: "available"; list: List }
	| { status: "deleted"; listId: string; deletedAt: number; updatedAt: number }
	| { status: "missing"; listId: string };

export type RenameListResult =
	| { status: "available"; list: List; didWrite: boolean }
	| {
			status: "invalidName";
			reason: ListNameValidationError;
			didWrite: false;
	  }
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
	listLists(input?: ListListsInput): Promise<ListSummary[]>;
	renameList(input: RenameListInput): Promise<RenameListResult>;
	deleteList(input: DeleteListInput): Promise<DeleteListResult>;
};

export type ListServiceDeps = {
	householdId: string;
	userId: string;
	store: HouseholdStoreExecutor;
	logger?: Logger;
	analytics?: ServiceAnalytics;
};

const listRowSchema = z.object({
	id: z.string(),
	name: z.string(),
	created_by_user_id: z.string(),
	created_at: sqlNumberSchema,
	updated_at: sqlNumberSchema,
	archived_at: sqlNumberSchema.nullable(),
	deleted_at: sqlNumberSchema.nullable(),
});

const listSummaryRowSchema = listRowSchema.omit({ deleted_at: true }).extend({
	last_activity_at: sqlNumberSchema,
	unchecked_item_count: sqlNumberSchema,
	checked_item_count: sqlNumberSchema,
});

export function createListService(deps: ListServiceDeps): ListService {
	const log = (deps.logger ?? defaultLogger).with({
		household_id: deps.householdId,
		service: "list",
	});
	const analytics = deps.analytics ?? { track };

	return {
		async createList(input) {
			const name = validateListName(input.name);
			if (name.status === "invalidName") {
				return { ...name, didWrite: false };
			}

			try {
				const now = listServiceTimestamp();
				const id = createAppId("lst", randomUuid);
				await deps.store.execute({
					kind: "write",
					sql: `
            INSERT INTO lists (
              id,
              name,
              created_by_user_id,
              created_at,
              updated_at,
              archived_at,
              deleted_at
            )
            VALUES (?, ?, ?, ?, ?, NULL, NULL)
          `,
					args: [id, name.name, deps.userId, now, now],
				});
				const list: List = {
					id,
					householdId: deps.householdId,
					name: name.name,
					createdByUserId: deps.userId,
					createdAt: now,
					updatedAt: now,
					archived: false,
					archivedAt: null,
				};
				analytics.track("list_created", analyticsProperties(deps, id));
				return { status: "available", list, didWrite: true };
			} catch (error) {
				log.error("list create failed", { error: asError(error) });
				throw error;
			}
		},
		async getList(input) {
			try {
				return resultFromLifecycleRow(
					await readListLifecycleRow(deps.store, input.listId),
					deps.householdId,
					input.listId,
				);
			} catch (error) {
				log.error("list metadata load failed", {
					error: asError(error),
					list_id: input.listId,
				});
				throw error;
			}
		},
		async listLists(input = {}) {
			try {
				const query = listListsQuery(input);
				const result = await deps.store.execute({
					kind: "read",
					sql: query.sql,
					args: query.args,
				});

				return result.rows.map((row) =>
					listSummaryFromRow(row, deps.householdId),
				);
			} catch (error) {
				log.error("list summaries load failed", { error: asError(error) });
				throw error;
			}
		},
		async renameList(input) {
			const name = validateListName(input.name);
			if (name.status === "invalidName") {
				return { ...name, didWrite: false };
			}

			try {
				const current = await readListLifecycleRow(deps.store, input.listId);
				const lifecycle = resultFromLifecycleRow(
					current,
					deps.householdId,
					input.listId,
				);
				if (lifecycle.status === "missing") {
					return { ...lifecycle, didWrite: false };
				}
				if (lifecycle.status === "deleted") {
					return { ...lifecycle, didWrite: false };
				}
				if (lifecycle.list.name === name.name) {
					return { ...lifecycle, didWrite: false };
				}

				const now = listServiceTimestamp();
				const updateResult = await deps.store.execute({
					kind: "write",
					sql: `
	            UPDATE lists
	            SET name = ?, updated_at = ?
            WHERE id = ? AND deleted_at IS NULL
						`,
					args: [name.name, now, input.listId],
				});
				if (updateResult.rowsAffected === 0) {
					const latest = resultFromLifecycleRow(
						await readListLifecycleRow(deps.store, input.listId),
						deps.householdId,
						input.listId,
					);
					return { ...latest, didWrite: false };
				}
				const list = {
					...lifecycle.list,
					name: name.name,
					updatedAt: now,
				};
				analytics.track(
					"list_renamed",
					analyticsProperties(deps, input.listId),
				);
				return { status: "available", list, didWrite: true };
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
				const current = await readListLifecycleRow(deps.store, input.listId);
				const lifecycle = resultFromLifecycleRow(
					current,
					deps.householdId,
					input.listId,
				);
				if (lifecycle.status === "missing") {
					return { ...lifecycle, didWrite: false };
				}
				if (lifecycle.status === "deleted") {
					return { ...lifecycle, didWrite: false };
				}

				const now = listServiceTimestamp();
				const updateResult = await deps.store.execute({
					kind: "write",
					sql: `
	            UPDATE lists
	            SET deleted_at = ?, updated_at = ?
            WHERE id = ? AND deleted_at IS NULL
						`,
					args: [now, now, input.listId],
				});
				if (updateResult.rowsAffected === 0) {
					return deleteResultFromLifecycleRow(
						await readListLifecycleRow(deps.store, input.listId),
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
	};
}

function listFromRow(row: Record<string, unknown>, householdId: string): List {
	const parsed = listRowSchema.parse(row);

	return {
		id: parsed.id,
		householdId,
		name: parsed.name,
		createdByUserId: parsed.created_by_user_id,
		createdAt: parsed.created_at,
		updatedAt: parsed.updated_at,
		archived: parsed.archived_at !== null,
		archivedAt: parsed.archived_at,
	};
}

function listSummaryFromRow(
	row: Record<string, unknown>,
	householdId: string,
): ListSummary {
	const parsed = listSummaryRowSchema.parse(row);

	return {
		id: parsed.id,
		householdId,
		name: parsed.name,
		createdByUserId: parsed.created_by_user_id,
		createdAt: parsed.created_at,
		updatedAt: parsed.updated_at,
		archived: parsed.archived_at !== null,
		archivedAt: parsed.archived_at,
		lastActivityAt: parsed.last_activity_at,
		uncheckedItemCount: parsed.unchecked_item_count,
		checkedItemCount: parsed.checked_item_count,
	};
}

function listListsQuery(input: ListListsInput): {
	sql: string;
	args: HouseholdSqlValue[];
} {
	const where = ["l.deleted_at IS NULL"];
	const args: HouseholdSqlValue[] = [];

	switch (input.archive ?? "active") {
		case "active":
			where.push("l.archived_at IS NULL");
			break;
		case "archived":
			where.push("l.archived_at IS NOT NULL");
			break;
		case "all":
			break;
	}

	const searchText = input.searchText?.trim();
	if (searchText) {
		where.push("LOWER(l.name) LIKE LOWER(?) ESCAPE '\\'");
		args.push(`%${escapeSqlLike(searchText)}%`);
	}

	if (input.createdByUserId) {
		where.push("l.created_by_user_id = ?");
		args.push(input.createdByUserId);
	}

	return {
		sql: `
      SELECT
        l.id,
        l.name,
        l.created_by_user_id,
        l.created_at,
        l.updated_at,
        l.archived_at,
        MAX(
          l.updated_at,
          COALESCE(MAX(i.updated_at), l.updated_at),
          COALESCE(MAX(c.updated_at), l.updated_at)
        ) AS last_activity_at,
        COALESCE(SUM(
          CASE
            WHEN i.id IS NOT NULL AND c.checked_at IS NULL THEN 1
            ELSE 0
          END
        ), 0) AS unchecked_item_count,
        COALESCE(SUM(
          CASE
            WHEN i.id IS NOT NULL AND c.checked_at IS NOT NULL THEN 1
            ELSE 0
          END
        ), 0) AS checked_item_count
      FROM lists l
      LEFT JOIN items i
        ON i.list_id = l.id
        AND i.deleted_at IS NULL
      LEFT JOIN item_checks c ON c.rowid = (
        SELECT c2.rowid
        FROM item_checks c2
        WHERE c2.item_id = i.id
        ORDER BY c2.updated_at DESC, c2.user_id DESC
        LIMIT 1
      )
      WHERE ${where.join(" AND ")}
      GROUP BY
        l.id,
        l.name,
        l.created_by_user_id,
        l.created_at,
        l.updated_at,
        l.archived_at
      ${listListsOrderBy(input.sort ?? "recentActivity")}
    `,
		args,
	};
}

function listListsOrderBy(sort: NonNullable<ListListsInput["sort"]>): string {
	switch (sort) {
		case "recentActivity":
			return "ORDER BY last_activity_at DESC, l.created_at ASC, l.id ASC";
		case "name":
			return "ORDER BY LOWER(l.name) ASC, l.created_at ASC, l.id ASC";
		case "createdAt":
			return "ORDER BY l.created_at DESC, l.id ASC";
	}
}

function escapeSqlLike(value: string): string {
	return value.replace(/[\\%_]/g, "\\$&");
}

async function readListLifecycleRow(
	store: HouseholdStoreExecutor,
	listId: string,
): Promise<Record<string, unknown> | null> {
	const result = await store.execute({
		kind: "read",
		sql: `
      SELECT
        id,
        name,
        created_by_user_id,
        created_at,
        updated_at,
        archived_at,
        deleted_at
      FROM lists
      WHERE id = ?
      LIMIT 1
    `,
		args: [listId],
	});
	return result.rows[0] ?? null;
}

function resultFromLifecycleRow(
	row: Record<string, unknown> | null,
	householdId: string,
	listId: string,
): GetListResult {
	if (!row) return { status: "missing", listId };
	const parsed = listRowSchema.parse(row);
	if (parsed.deleted_at !== null) {
		return {
			status: "deleted",
			listId,
			deletedAt: parsed.deleted_at,
			updatedAt: parsed.updated_at,
		};
	}

	return { status: "available", list: listFromRow(row, householdId) };
}

function deleteResultFromLifecycleRow(
	row: Record<string, unknown> | null,
	householdId: string,
	listId: string,
): DeleteListResult {
	const lifecycle = resultFromLifecycleRow(row, householdId, listId);
	if (lifecycle.status === "available") {
		throw new Error("List delete did not affect the expected row");
	}
	return { ...lifecycle, didWrite: false };
}

function validateListName(
	value: string,
):
	| { status: "available"; name: string }
	| { status: "invalidName"; reason: ListNameValidationError } {
	const name = value.trim();
	if (!name) return { status: "invalidName", reason: "required" };
	if (name.length > 80) return { status: "invalidName", reason: "tooLong" };
	return { status: "available", name };
}

function analyticsProperties(deps: ListServiceDeps, listId: string) {
	return {
		household_id: deps.householdId,
		list_id: listId,
		user_id: deps.userId,
	};
}

function listServiceTimestamp(): number {
	const timestamp = Math.trunc(Date.now());
	if (!Number.isFinite(timestamp)) {
		throw new Error("Timestamp source must return a finite number");
	}
	return timestamp;
}

function randomUuid(): string {
	return globalThis.crypto?.randomUUID?.() ?? Crypto.randomUUID();
}
