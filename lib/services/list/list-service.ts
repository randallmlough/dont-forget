import * as Crypto from "expo-crypto";
import { z } from "zod";

import { sqlNumberSchema } from "@/db/utils";
import { track } from "@/lib/analytics";
import { asError } from "@/lib/errors";
import { createAppId } from "@/lib/ids";
import { logger as defaultLogger, type Logger } from "@/lib/logger";
import type { ServiceAnalytics } from "@/lib/services/analytics";
import type { HouseholdStoreExecutor } from "@/lib/services/household";

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
};

export type ListServiceDeps = {
	householdId: string;
	userId: string;
	store: HouseholdStoreExecutor;
	logger?: Logger;
	analytics?: ServiceAnalytics;
};

const LIST_NAME_MAX_LENGTH = 80;

const listRowSchema = z.object({
	id: z.string(),
	name: z.string(),
	created_by_user_id: z.string(),
	created_at: sqlNumberSchema,
	updated_at: sqlNumberSchema,
	archived_at: sqlNumberSchema.nullable(),
	deleted_at: sqlNumberSchema.nullable(),
});

type ListRow = z.infer<typeof listRowSchema>;

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
				const id = createAppId("lst", randomUuid);
				await deps.store.execute({
					kind: "write",
					sql: `
            INSERT INTO lists (id, name, created_by_user_id, created_at, updated_at, archived_at)
            VALUES (?, ?, ?, ?, ?, NULL)
          `,
					args: [id, validated.name, deps.userId, now, now],
				});
				analytics.track("list_created", {
					household_id: deps.householdId,
					list_id: id,
					user_id: deps.userId,
				});

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
				const row = await readListRow(deps.store, input.listId);
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
				const row = await readListRow(deps.store, input.listId);
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
				await deps.store.execute({
					kind: "write",
					sql: "UPDATE lists SET name = ?, updated_at = ? WHERE id = ?",
					args: [validated.name, now, input.listId],
				});
				analytics.track("list_renamed", {
					household_id: deps.householdId,
					list_id: input.listId,
					user_id: deps.userId,
				});

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
				const row = await readListRow(deps.store, input.listId);
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
				await deps.store.execute({
					kind: "write",
					sql: "UPDATE lists SET deleted_at = ?, updated_at = ? WHERE id = ?",
					args: [now, now, input.listId],
				});
				analytics.track("list_deleted", {
					household_id: deps.householdId,
					list_id: input.listId,
					user_id: deps.userId,
				});

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

async function readListRow(
	store: HouseholdStoreExecutor,
	listId: string,
): Promise<ListRow | null> {
	const result = await store.execute({
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
	return row ? listRowSchema.parse(row) : null;
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
