// /api/data — the PowerSync write endpoint (Tier-1 + Tier-2 hardened).
//
// PLACEMENT EXCEPTION: this file deliberately holds raw pg SQL inside lib/api,
// which docs/how-things-work/api-routes.md forbids ("lib/api is not a
// data-access layer"). /api/data is a generic CRUD applicator with no natural
// domain-service home (analogous to the documented app/api/bootstrap
// exception), so it is a justified new boundary exception. Do NOT "fix" it by
// dispersing the applicator into domain services — the doc reconciliation is
// PR-D's job.
//
// Hardening vs the spike (spikes/powersync/backend/server.mjs):
//   - AUTHN: sub-only Clerk verifyToken (no Backend-API getUser round-trip);
//     resolve the internal users.id by clerk_user_id from the pg directory.
//   - Zod-validated batch body; malformed -> terminal 4xx.
//   - Per-op table allow-list + per-column allow-list (closes the
//     Object.keys(data) -> SQL hole).
//   - Per-row membership authz: active membership == removed_at IS NULL.
//   - LWW by updated_at; tombstone monotonicity; updated_at clamp to <= now().
//   - item_checks (Decision 9): uncheck sets checked_at = NULL, never deletes.
//   - 4xx for terminal client errors (client discards), 5xx for transient
//     (client retries) — the liveness guarantee.

import { z } from "zod";
import {
	type DataTable,
	HOUSEHOLD_RESOLUTION,
	isDataTable,
	WRITABLE_COLUMNS,
} from "./columns";

const opSchema = z.object({
	op: z.enum(["PUT", "PATCH", "DELETE"]),
	table: z.string(),
	id: z.string(),
	data: z.record(z.string(), z.unknown()).default({}),
});

const batchSchema = z.object({
	batch: z.array(opSchema),
});

export type DataOp = z.infer<typeof opSchema>;

// A stored row's fields relevant to LWW + tombstone checks, keyed on the
// synthetic id. Returns undefined when no row exists yet.
export type StoredRowState = {
	updatedAt: Date | null;
	deletedAt: Date | null;
};

// The injected boundary: a transaction-scoped applicator over the pg source.
// Tests provide a fake; production wires it to a pg transaction.
export type DataTransaction = {
	// Resolve the Household id(s) a write touches (for authz). Empty array means
	// the targeted row could not be resolved to any Household.
	householdsForOp(op: DataOp): Promise<string[]>;
	// Active membership == memberships.removed_at IS NULL.
	isActiveMember(userId: string, householdId: string): Promise<boolean>;
	// Stored LWW/tombstone state for a row keyed on the synthetic id.
	storedRowState(
		table: DataTable,
		id: string,
	): Promise<StoredRowState | undefined>;
	upsert(
		table: DataTable,
		id: string,
		data: Record<string, unknown>,
	): Promise<void>;
	patch(
		table: DataTable,
		id: string,
		data: Record<string, unknown>,
	): Promise<void>;
	// Tombstone (non-item_checks) or uncheck (item_checks). The applicator
	// decides which based on the table; the transaction performs the SQL.
	tombstone(table: DataTable, id: string): Promise<void>;
	uncheckItemCheck(id: string): Promise<void>;
};

export type DataDeps = {
	// Returns the internal users.id, or throws ApiAuthError on bad/missing token.
	authenticate?: (request: Request) => Promise<string>;
	// Runs `body` inside a single pg transaction (BEGIN/COMMIT/ROLLBACK).
	withTransaction?: <T>(run: (tx: DataTransaction) => Promise<T>) => Promise<T>;
};

// Terminal client error (4xx): the client connector discards the op.
class DataClientError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "DataClientError";
	}
}

// Auth failure (401).
export class DataAuthError extends Error {
	constructor(message = "Unauthorized") {
		super(message);
		this.name = "DataAuthError";
	}
}

export async function handleDataUpload(
	request: Request,
	deps?: DataDeps,
): Promise<Response> {
	let userId: string;
	try {
		userId = await authenticate(request, deps);
	} catch (error) {
		if (error instanceof DataAuthError) {
			return errorResponse(error.message, 401);
		}
		// Unexpected auth-path failure is transient.
		return errorResponse("Server error", 500);
	}

	let batch: DataOp[];
	try {
		batch = await parseBatch(request);
	} catch (error) {
		if (error instanceof DataClientError) {
			return errorResponse(error.message, error.status);
		}
		return errorResponse("Server error", 500);
	}

	try {
		await withTransaction(deps, async (tx) => {
			for (const op of batch) {
				await applyOp(tx, userId, op);
			}
		});
	} catch (error) {
		if (error instanceof DataClientError) {
			// Terminal: the whole transaction rolled back; the client discards.
			return errorResponse(error.message, error.status);
		}
		// Transient (db unavailable, etc.): the client retries.
		return errorResponse("Server error", 500);
	}

	return Response.json({ ok: true }, { status: 200 });
}

async function applyOp(
	tx: DataTransaction,
	userId: string,
	op: DataOp,
): Promise<void> {
	if (!isDataTable(op.table)) {
		throw new DataClientError(`Unknown table ${op.table}`, 400);
	}
	const table = op.table;

	assertColumnsAllowed(table, op.data);

	await assertAuthorized(tx, userId, op);

	const incomingUpdatedAt = clampUpdatedAt(op.data);
	const stored = await tx.storedRowState(table, op.id);

	// LWW: skip an op older than the stored row.
	if (
		stored?.updatedAt &&
		incomingUpdatedAt &&
		incomingUpdatedAt.getTime() < stored.updatedAt.getTime()
	) {
		return;
	}

	if (op.op === "DELETE") {
		// item_checks (Decision 9): uncheck — keep the row, set checked_at NULL.
		if (table === "item_checks") {
			await tx.uncheckItemCheck(op.id);
			return;
		}
		await tx.tombstone(table, op.id);
		return;
	}

	// Tombstone monotonicity: once deleted_at is set, a later write must not
	// clear/resurrect it. Reject the un-delete.
	if (stored?.deletedAt && clearsDeletedAt(op.data)) {
		throw new DataClientError("Cannot resurrect a deleted row", 409);
	}

	const data = withClampedUpdatedAt(op.data, incomingUpdatedAt);
	if (op.op === "PUT") {
		await tx.upsert(table, op.id, data);
		return;
	}
	await tx.patch(table, op.id, data);
}

function assertColumnsAllowed(
	table: DataTable,
	data: Record<string, unknown>,
): void {
	const allowed = WRITABLE_COLUMNS[table];
	for (const key of Object.keys(data)) {
		if (!allowed.has(key)) {
			throw new DataClientError(
				`Disallowed column ${key} for table ${table}`,
				400,
			);
		}
	}
}

async function assertAuthorized(
	tx: DataTransaction,
	userId: string,
	op: DataOp,
): Promise<void> {
	if (HOUSEHOLD_RESOLUTION[op.table as DataTable] === "unscoped") {
		return;
	}
	const householdIds = await tx.householdsForOp(op);
	for (const householdId of householdIds) {
		if (!(await tx.isActiveMember(userId, householdId))) {
			throw new DataClientError("Not an active Member of the Household", 403);
		}
	}
}

// Clamp incoming updated_at to <= now() so a client clock cannot pin a row
// far into the future and win every future LWW comparison.
function clampUpdatedAt(data: Record<string, unknown>): Date | undefined {
	const raw = data.updated_at;
	if (raw === undefined || raw === null) return undefined;
	const parsed = new Date(raw as string | number);
	if (Number.isNaN(parsed.getTime())) return undefined;
	const now = Date.now();
	return parsed.getTime() > now ? new Date(now) : parsed;
}

function withClampedUpdatedAt(
	data: Record<string, unknown>,
	clamped: Date | undefined,
): Record<string, unknown> {
	if (clamped === undefined || data.updated_at === undefined) return data;
	return { ...data, updated_at: clamped.toISOString() };
}

function clearsDeletedAt(data: Record<string, unknown>): boolean {
	return "deleted_at" in data && data.deleted_at == null;
}

async function authenticate(
	request: Request,
	deps?: DataDeps,
): Promise<string> {
	if (deps?.authenticate) {
		return deps.authenticate(request);
	}
	return defaultAuthenticate(request);
}

// Sub-only Clerk verification: verifyToken (no Backend-API getUser round-trip),
// then resolve the internal users.id by clerk_user_id from the pg directory.
async function defaultAuthenticate(request: Request): Promise<string> {
	const [{ bearerToken }, { verifyToken }, { readClerkServerConfig }] =
		await Promise.all([
			import("@/lib/server/auth"),
			import("@clerk/backend"),
			import("@/lib/env"),
		]);

	let clerkUserId: string | undefined;
	try {
		const token = bearerToken(request.headers.get("authorization"));
		const { secretKey } = readClerkServerConfig();
		const payload = await verifyToken(token, { secretKey });
		clerkUserId = payload.sub;
	} catch {
		throw new DataAuthError("Invalid Clerk session token");
	}
	if (!clerkUserId) {
		throw new DataAuthError("Invalid Clerk session token");
	}

	const { eq } = await import("drizzle-orm");
	const { postgresDb, postgresPool } = await import("@/db/server/pg-client");
	const { users } = await import("@/db/schema/postgres");
	const pool = postgresPool();
	try {
		const db = postgresDb(pool);
		const [row] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.clerkUserId, clerkUserId))
			.limit(1);
		if (!row) {
			throw new DataAuthError("Unknown User");
		}
		return row.id;
	} finally {
		await pool.end();
	}
}

async function withTransaction<T>(
	deps: DataDeps | undefined,
	run: (tx: DataTransaction) => Promise<T>,
): Promise<T> {
	if (deps?.withTransaction) {
		return deps.withTransaction(run);
	}
	return defaultWithTransaction(run);
}

// Production transaction: one pg connection, BEGIN/COMMIT/ROLLBACK, with the
// raw SQL applicator wired to the schema's Household-resolution paths.
async function defaultWithTransaction<T>(
	run: (tx: DataTransaction) => Promise<T>,
): Promise<T> {
	const { postgresPool } = await import("@/db/server/pg-client");
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

type PgQueryClient = {
	query(
		text: string,
		params?: unknown[],
	): Promise<{ rows: Record<string, unknown>[] }>;
};

function pgDataTransaction(client: PgQueryClient): DataTransaction {
	return {
		async householdsForOp(op) {
			const resolution = HOUSEHOLD_RESOLUTION[op.table as DataTable];
			if (resolution === "row-household-id") {
				const onRow = op.data.household_id;
				if (typeof onRow === "string") return [onRow];
				const r = await client.query(
					`SELECT household_id FROM ${op.table} WHERE id = $1`,
					[op.id],
				);
				return r.rows
					.map((x) => x.household_id)
					.filter((v): v is string => typeof v === "string");
			}
			if (resolution === "via-list") {
				const listId = op.data.list_id;
				if (typeof listId === "string") {
					const r = await client.query(
						"SELECT household_id FROM lists WHERE id = $1",
						[listId],
					);
					return r.rows
						.map((x) => x.household_id)
						.filter((v): v is string => typeof v === "string");
				}
				const r = await client.query(
					"SELECT l.household_id FROM items i JOIN lists l ON l.id = i.list_id WHERE i.id = $1",
					[op.id],
				);
				return r.rows
					.map((x) => x.household_id)
					.filter((v): v is string => typeof v === "string");
			}
			if (resolution === "via-item") {
				let itemId = op.data.item_id;
				if (typeof itemId !== "string") {
					const r0 = await client.query(
						"SELECT item_id FROM item_checks WHERE id = $1",
						[op.id],
					);
					itemId = r0.rows[0]?.item_id;
				}
				if (typeof itemId !== "string") return [];
				const r = await client.query(
					"SELECT l.household_id FROM items i JOIN lists l ON l.id = i.list_id WHERE i.id = $1",
					[itemId],
				);
				return r.rows
					.map((x) => x.household_id)
					.filter((v): v is string => typeof v === "string");
			}
			return [];
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
			const updates = cols
				.filter((c) => c !== "id")
				.map((c) => `${c} = EXCLUDED.${c}`);
			const setClause =
				updates.length > 0
					? `DO UPDATE SET ${updates.join(", ")}`
					: "DO NOTHING";
			await client.query(
				`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) ON CONFLICT (id) ${setClause}`,
				vals,
			);
		},
		async patch(table, id, data) {
			const cols = Object.keys(data).filter((c) => c !== "id");
			if (cols.length === 0) return;
			const set = cols.map((c, i) => `${c} = $${i + 1}`);
			await client.query(
				`UPDATE ${table} SET ${set.join(", ")} WHERE id = $${cols.length + 1}`,
				[...cols.map((c) => data[c]), id],
			);
		},
		async tombstone(table, id) {
			await client.query(
				`UPDATE ${table} SET deleted_at = now(), updated_at = now() WHERE id = $1`,
				[id],
			);
		},
		async uncheckItemCheck(id) {
			await client.query(
				"UPDATE item_checks SET checked_at = NULL, checked_by_user_id = NULL, updated_at = now() WHERE id = $1",
				[id],
			);
		},
	};
}

async function parseBatch(request: Request): Promise<DataOp[]> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw new DataClientError("Malformed JSON", 400);
	}
	const result = batchSchema.safeParse(body);
	if (!result.success) {
		throw new DataClientError("Malformed batch", 400);
	}
	return result.data.batch;
}

function errorResponse(message: string, status: number): Response {
	return Response.json({ error: message }, { status });
}
