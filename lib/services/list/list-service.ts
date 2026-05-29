import { z } from "zod";

import { sqlNumberSchema } from "@/db/utils";
import { asError } from "@/lib/errors";
import { logger as defaultLogger, type Logger } from "@/lib/logger";
import type { HouseholdStoreExecutor } from "@/lib/services/household";

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

	return {
		async getList(input) {
			try {
				const result = await deps.store.execute({
					kind: "read",
					sql: `
            SELECT id, name, created_by_user_id, created_at, updated_at
            FROM lists
            WHERE id = ? AND deleted_at IS NULL
            LIMIT 1
          `,
					args: [input.listId],
				});
				const row = result.rows[0];
				if (!row) {
					throw new ListNotFoundError(input.listId);
				}

				return listFromRow(row, deps.householdId);
			} catch (error) {
				if (error instanceof ListNotFoundError) {
					throw error;
				}

				log.error("list metadata load failed", {
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
	};
}
