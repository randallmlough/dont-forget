// Production pg transaction for /api/data: one connection, BEGIN/COMMIT/ROLLBACK,
// with the raw SQL applicator wired to the schema's Household-resolution paths.
//
// This is the only module that knows the pg wire shape; the applicator core
// (./applicator) decides intent and calls these methods through the
// DataTransaction interface. Lives in the db layer (ADR-0014).

import { HOUSEHOLD_RESOLUTION } from "@/db/schema/postgres/sync-columns";
import { postgresPool } from "@/db/server/pg-client";
import type { DataTransaction } from "./applicator";

export type PgQueryClient = {
	query(
		text: string,
		params?: unknown[],
	): Promise<{ rows: Record<string, unknown>[] }>;
};

// Production transaction: one pg connection, BEGIN/COMMIT/ROLLBACK, with the
// raw SQL applicator wired to the schema's Household-resolution paths.
export async function defaultWithTransaction<T>(
	run: (tx: DataTransaction) => Promise<T>,
): Promise<T> {
	const pool = postgresPool();
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const tx = pgDataTransaction(client);
		const result = await run(tx);
		await client.query("COMMIT");
		return result;
	} catch (error) {
		await client.query("ROLLBACK").catch(() => {});
		throw error;
	} finally {
		client.release();
		await pool.end();
	}
}

export function pgDataTransaction(client: PgQueryClient): DataTransaction {
	return {
		async householdsForOp(table, op) {
			// Authorize the STORED row's Household (so a caller cannot mutate
			// someone else's row) AND the DESTINATION Household the payload scoping
			// FK points at (so a Member of A cannot move an existing row into B by
			// PATCHing its list_id/household_id/item_id). When a stored row exists
			// we return the dedup union of both; assertAuthorized fails closed on
			// every returned Household, so a cross-Household move is blocked unless
			// the caller belongs to both. A pure non-FK edit carries no scoping FK,
			// so the destination is empty and only the stored Household is checked.
			// A brand-new create (no stored row) resolves from the payload parent.
			const resolution = HOUSEHOLD_RESOLUTION[table];
			const fromHouseholdId = (rows: Record<string, unknown>[]): string[] =>
				rows
					.map((x) => x.household_id)
					.filter((v): v is string => typeof v === "string");
			const union = (...lists: string[][]): string[] => [
				...new Set(lists.flat()),
			];

			if (resolution === "row-household-id") {
				const destIds = async (): Promise<string[]> => {
					const onRow = op.data.household_id;
					return typeof onRow === "string" ? [onRow] : [];
				};
				const stored = await client.query(
					`SELECT household_id FROM ${op.table} WHERE id = $1`,
					[op.id],
				);
				if (stored.rows.length > 0) {
					return union(fromHouseholdId(stored.rows), await destIds());
				}
				return destIds();
			}
			if (resolution === "via-list") {
				const destIds = async (): Promise<string[]> => {
					const listId = op.data.list_id;
					if (typeof listId !== "string") return [];
					const r = await client.query(
						"SELECT household_id FROM lists WHERE id = $1",
						[listId],
					);
					return fromHouseholdId(r.rows);
				};
				const stored = await client.query(
					"SELECT l.household_id FROM items i JOIN lists l ON l.id = i.list_id WHERE i.id = $1",
					[op.id],
				);
				if (stored.rows.length > 0) {
					return union(fromHouseholdId(stored.rows), await destIds());
				}
				return destIds();
			}
			// via-item (item_checks)
			const destIds = async (): Promise<string[]> => {
				const itemId = op.data.item_id;
				if (typeof itemId !== "string") return [];
				const r = await client.query(
					"SELECT l.household_id FROM items i JOIN lists l ON l.id = i.list_id WHERE i.id = $1",
					[itemId],
				);
				return fromHouseholdId(r.rows);
			};
			const stored = await client.query(
				"SELECT l.household_id FROM item_checks c JOIN items i ON i.id = c.item_id JOIN lists l ON l.id = i.list_id WHERE c.id = $1",
				[op.id],
			);
			if (stored.rows.length > 0) {
				return union(fromHouseholdId(stored.rows), await destIds());
			}
			return destIds();
		},
		async isActiveMember(userId, householdId) {
			const r = await client.query(
				"SELECT 1 FROM memberships WHERE user_id = $1 AND household_id = $2 AND removed_at IS NULL",
				[userId, householdId],
			);
			return r.rows.length > 0;
		},
		async storedRowState(table, id) {
			const hasDeletedAt = table !== "item_checks";
			const r = await client.query(
				`SELECT updated_at${hasDeletedAt ? ", deleted_at" : ""} FROM ${table} WHERE id = $1`,
				[id],
			);
			const row = r.rows[0];
			if (!row) return undefined;
			return {
				updatedAt: row.updated_at ? new Date(row.updated_at as string) : null,
				deletedAt:
					hasDeletedAt && row.deleted_at
						? new Date(row.deleted_at as string)
						: null,
			};
		},
		async upsert(table, id, data) {
			const cols = ["id", ...Object.keys(data).filter((c) => c !== "id")];
			const vals = cols.map((c) => (c === "id" ? id : data[c]));
			const placeholders = cols.map((_, i) => `$${i + 1}`);
			// item_checks has UNIQUE(item_id): a new synthetic id can collide on an
			// existing Item's row, so it conflicts on item_id (not id) and merges
			// last-writer-wins by updated_at. All other tables conflict on the id PK.
			const conflict = table === "item_checks" ? "(item_id)" : "(id)";
			const isKey = (c: string) =>
				c === "id" || (table === "item_checks" && c === "item_id");
			const updates = cols
				.filter((c) => !isKey(c))
				.map((c) => `${c} = EXCLUDED.${c}`);
			const lwwGuard =
				table === "item_checks"
					? " WHERE item_checks.updated_at <= EXCLUDED.updated_at"
					: "";
			const setClause =
				updates.length > 0
					? `DO UPDATE SET ${updates.join(", ")}${lwwGuard}`
					: "DO NOTHING";
			await client.query(
				`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) ON CONFLICT ${conflict} ${setClause}`,
				vals,
			);
		},
		async patch(table, id, data) {
			const cols = Object.keys(data).filter((c) => c !== "id");
			if (cols.length === 0) return;
			const set = cols.map((c, i) => `${c} = $${i + 1}`);
			const params: unknown[] = [...cols.map((c) => data[c]), id];
			let where = `WHERE id = $${cols.length + 1}`;
			// SQL-level LWW guard, closing the READ COMMITTED race: the JS LWW check
			// reads a stale row version, so two concurrent uploads can both pass it
			// before either commits. Postgres re-evaluates this WHERE against the
			// freshly committed row (EvalPlanQual) once the lock releases, dropping a
			// PATCH whose clock is older than the now-committed row. A guard-less
			// PATCH omits updated_at (no client clock to compare), so it falls
			// through to the plain id predicate.
			if (data.updated_at !== undefined) {
				params.push(data.updated_at);
				where += ` AND updated_at <= $${params.length}`;
			}
			await client.query(
				`UPDATE ${table} SET ${set.join(", ")} ${where}`,
				params,
			);
		},
		async tombstone(table, id, updatedAt) {
			// SQL-level LWW guard (see patch): a stale tombstone whose clock is older
			// than the concurrently committed row version is dropped by EvalPlanQual.
			await client.query(
				`UPDATE ${table} SET deleted_at = $2, updated_at = $2 WHERE id = $1 AND updated_at <= $2`,
				[id, updatedAt.toISOString()],
			);
		},
		async uncheckItemCheck(id, updatedAt) {
			// SQL-level LWW guard (see patch): a stale uncheck whose clock is older
			// than the concurrently committed row version is dropped by EvalPlanQual.
			await client.query(
				"UPDATE item_checks SET checked_at = NULL, checked_by_user_id = NULL, updated_at = $2 WHERE id = $1 AND updated_at <= $2",
				[id, updatedAt.toISOString()],
			);
		},
	};
}
