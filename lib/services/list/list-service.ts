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
};

export type GetListInput = {
	listId: string;
};

export type ListService = {
	getList(input: GetListInput): Promise<List>;
};

export type ListServiceDeps = {
	householdId: string;
	store: HouseholdStoreExecutor;
	logger?: Logger;
};

export class ListNotFoundError extends Error {
	constructor(listId: string) {
		super(`List not found: ${listId}`);
		this.name = "ListNotFoundError";
	}
}

const listRowSchema = z.object({
	id: z.string(),
	name: z.string(),
	created_by_user_id: z.string(),
	created_at: sqlNumberSchema,
	updated_at: sqlNumberSchema,
});

export function createListService(deps: ListServiceDeps): ListService {
	const log = (deps.logger ?? defaultLogger).with({
		household_id: deps.householdId,
		service: "list",
	});
	const analytics = deps.analytics ?? { track };

	return {
		async createList(input) {
			const validation = validateListName(input.name);
			if (validation.status === "invalid") {
				return validation;
			}

			try {
				const now = nextListServiceTimestamp();
				const id = createAppId("lst", randomUuid);
				await deps.store.execute({
					kind: "write",
					sql: `
            INSERT INTO lists (
              id,
              name,
              created_by_user_id,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?)
          `,
					args: [id, validation.name, deps.authenticatedUserId, now, now],
				});

				const list = {
					id,
					householdId: deps.householdId,
					name: validation.name,
					createdByUserId: deps.authenticatedUserId,
					createdAt: now,
					updatedAt: now,
					archived: false,
					archivedAt: null,
				};
				analytics.track("list_created", {
					household_id: deps.householdId,
					list_id: id,
					user_id: deps.authenticatedUserId,
				});

				return { status: "created", list };
			} catch (error) {
				log.error("List create failed", {
					error: asError(error),
				});
				throw error;
			}
		},
		async getList(input) {
			try {
				return readListLifecycle(input.listId);
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
				const archive = input.archive ?? "active";
				const searchText = input.searchText?.trim();
				const whereSql = ["l.deleted_at IS NULL"];
				const args: HouseholdSqlValue[] = [];
				if (archive === "active") {
					whereSql.push("l.archived_at IS NULL");
				}
				if (archive === "archived") {
					whereSql.push("l.archived_at IS NOT NULL");
				}
				if (searchText) {
					whereSql.push("LOWER(l.name) LIKE ?");
					args.push(`%${searchText.toLowerCase()}%`);
				}
				if (input.createdByUserId) {
					whereSql.push("l.created_by_user_id = ?");
					args.push(input.createdByUserId);
				}
				const orderBy = listSummaryOrderBy(input.sort ?? "recentActivity");
				const result = await deps.store.execute({
					kind: "read",
					sql: `
            SELECT
              l.id,
              l.name,
              l.created_by_user_id,
              l.created_at,
              l.updated_at,
              l.archived_at,
              l.deleted_at,
              MAX(
                l.updated_at,
                COALESCE((
                  SELECT MAX(i.updated_at)
                  FROM items i
                  WHERE i.list_id = l.id AND i.deleted_at IS NULL
                ), -9223372036854775808),
                COALESCE((
                  SELECT MAX(c.updated_at)
                  FROM items i
                  INNER JOIN item_checks c ON c.rowid = (
                    SELECT c2.rowid
                    FROM item_checks c2
                    WHERE c2.item_id = i.id
                    ORDER BY c2.updated_at DESC, c2.user_id DESC
                    LIMIT 1
                  )
                  WHERE i.list_id = l.id AND i.deleted_at IS NULL
                ), -9223372036854775808)
              ) AS last_activity_at,
              (
                SELECT COUNT(*)
                FROM items i
                WHERE i.list_id = l.id AND i.deleted_at IS NULL
              ) AS item_count,
              (
                SELECT COUNT(*)
                FROM items i
                INNER JOIN item_checks c ON c.rowid = (
                  SELECT c2.rowid
                  FROM item_checks c2
                  WHERE c2.item_id = i.id
                  ORDER BY c2.updated_at DESC, c2.user_id DESC
                  LIMIT 1
                )
                WHERE
                  i.list_id = l.id
                  AND i.deleted_at IS NULL
                  AND c.checked_at IS NOT NULL
              ) AS checked_item_count
            FROM lists l
            WHERE ${whereSql.join(" AND ")}
            ORDER BY ${orderBy}
          `,
					args,
				});

				return result.rows.map((row) =>
					listSummaryFromRow(row, deps.householdId),
				);
			} catch (error) {
				log.error("List summary load failed", {
					error: asError(error),
				});
				throw error;
			}
		},
		async listActiveLists() {
			return this.listLists({ archive: "active" });
		},
		async renameList(input) {
			const validation = validateListName(input.name);
			if (validation.status === "invalid") {
				return validation;
			}

			try {
				const lifecycle = await readListLifecycle(input.listId);
				if (lifecycle.status === "missing" || lifecycle.status === "deleted") {
					return lifecycle;
				}

				if (lifecycle.list.name === validation.name) {
					return { status: "unchanged", list: lifecycle.list };
				}

				const now = nextListServiceTimestamp();
				const updateResult = await deps.store.execute({
					kind: "write",
					sql: `
            UPDATE lists
            SET name = ?, updated_at = ?
            WHERE id = ? AND deleted_at IS NULL
          `,
					args: [validation.name, now, input.listId],
				});
				if (updateResult.rowsAffected === 0) {
					const staleLifecycle = await readListLifecycle(input.listId);
					if (
						staleLifecycle.status === "missing" ||
						staleLifecycle.status === "deleted"
					) {
						return staleLifecycle;
					}

					throw new Error("List rename update did not modify a row");
				}

				const list = {
					...lifecycle.list,
					name: validation.name,
					updatedAt: now,
				};
				analytics.track("list_renamed", {
					household_id: deps.householdId,
					list_id: input.listId,
					user_id: deps.authenticatedUserId,
				});

				return { status: "renamed", list };
			} catch (error) {
				log.error("List rename failed", {
					error: asError(error),
					list_id: input.listId,
				});
				throw error;
			}
		},
		async archiveList(input) {
			try {
				const lifecycle = await readListLifecycle(input.listId);
				if (lifecycle.status === "missing" || lifecycle.status === "deleted") {
					return lifecycle;
				}

				if (lifecycle.list.archived) {
					return { status: "unchanged", list: lifecycle.list };
				}

				const now = nextListServiceTimestamp();
				const updateResult = await deps.store.execute({
					kind: "write",
					sql: `
            UPDATE lists
            SET archived_at = ?, updated_at = ?
            WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL
          `,
					args: [now, now, input.listId],
				});
				if (updateResult.rowsAffected === 0) {
					const staleLifecycle = await readListLifecycle(input.listId);
					if (
						staleLifecycle.status === "missing" ||
						staleLifecycle.status === "deleted"
					) {
						return staleLifecycle;
					}
					if (staleLifecycle.list.archived) {
						return { status: "unchanged", list: staleLifecycle.list };
					}

					throw new Error("List archive update did not modify a row");
				}

				const list = {
					...lifecycle.list,
					updatedAt: now,
					archived: true,
					archivedAt: now,
				};
				analytics.track("list_archived", {
					household_id: deps.householdId,
					list_id: input.listId,
					user_id: deps.authenticatedUserId,
				});

				return { status: "archived", list };
			} catch (error) {
				log.error("List archive failed", {
					error: asError(error),
					list_id: input.listId,
				});
				throw error;
			}
		},
		async unarchiveList(input) {
			try {
				const lifecycle = await readListLifecycle(input.listId);
				if (lifecycle.status === "missing" || lifecycle.status === "deleted") {
					return lifecycle;
				}

				if (!lifecycle.list.archived) {
					return { status: "unchanged", list: lifecycle.list };
				}

				const now = nextListServiceTimestamp();
				const updateResult = await deps.store.execute({
					kind: "write",
					sql: `
            UPDATE lists
            SET archived_at = NULL, updated_at = ?
            WHERE id = ? AND deleted_at IS NULL AND archived_at IS NOT NULL
          `,
					args: [now, input.listId],
				});
				if (updateResult.rowsAffected === 0) {
					const staleLifecycle = await readListLifecycle(input.listId);
					if (
						staleLifecycle.status === "missing" ||
						staleLifecycle.status === "deleted"
					) {
						return staleLifecycle;
					}
					if (!staleLifecycle.list.archived) {
						return { status: "unchanged", list: staleLifecycle.list };
					}

					throw new Error("List unarchive update did not modify a row");
				}

				const list = {
					...lifecycle.list,
					updatedAt: now,
					archived: false,
					archivedAt: null,
				};
				analytics.track("list_unarchived", {
					household_id: deps.householdId,
					list_id: input.listId,
					user_id: deps.authenticatedUserId,
				});

				return { status: "unarchived", list };
			} catch (error) {
				log.error("List unarchive failed", {
					error: asError(error),
					list_id: input.listId,
				});
				throw error;
			}
		},
		async deleteList(input) {
			try {
				const lifecycle = await readListLifecycle(input.listId);
				if (lifecycle.status === "missing") {
					return lifecycle;
				}
				if (lifecycle.status === "deleted") {
					return { ...lifecycle, status: "already-deleted" };
				}

				const now = nextListServiceTimestamp();
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
					const staleLifecycle = await readListLifecycle(input.listId);
					if (staleLifecycle.status === "missing") {
						return staleLifecycle;
					}
					if (staleLifecycle.status === "deleted") {
						return { ...staleLifecycle, status: "already-deleted" };
					}

					throw new Error("List delete update did not modify a row");
				}

				analytics.track("list_deleted", {
					household_id: deps.householdId,
					list_id: input.listId,
					user_id: deps.authenticatedUserId,
				});

				return {
					status: "deleted",
					listId: input.listId,
					deletedAt: now,
					updatedAt: now,
				};
			} catch (error) {
				log.error("List delete failed", {
					error: asError(error),
					list_id: input.listId,
				});
				throw error;
			}
		},
	};

	async function readListLifecycle(listId: string): Promise<
		| { status: "available"; list: List }
		| { status: "missing"; listId: string }
		| {
				status: "deleted";
				listId: string;
				deletedAt: number;
				updatedAt: number;
		  }
	> {
		const result = await deps.store.execute({
			kind: "read",
			sql: `
            SELECT id, name, created_by_user_id, created_at, updated_at, archived_at, deleted_at
            FROM lists
            WHERE id = ?
            LIMIT 1
          `,
			args: [listId],
		});
		const row = result.rows[0];
		if (!row) {
			return { status: "missing", listId };
		}

		const parsed = listLifecycleRowSchema.parse(row);
		if (parsed.deleted_at !== null) {
			return {
				status: "deleted",
				listId,
				deletedAt: parsed.deleted_at,
				updatedAt: parsed.updated_at,
			};
		}

		return { status: "available", list: listFromRow(row, deps.householdId) };
	}
}

function validateListName(
	rawName: string,
):
	| { status: "valid"; name: string }
	| { status: "invalid"; error: ListNameValidationError } {
	const name = rawName.trim();
	if (!name) {
		return { status: "invalid", error: { code: "empty-name", name } };
	}

	if (name.length > LIST_NAME_MAX_LENGTH) {
		return {
			status: "invalid",
			error: {
				code: "name-too-long",
				name,
				maxLength: LIST_NAME_MAX_LENGTH,
			},
		};
	}

	return { status: "valid", name };
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
	};
}
