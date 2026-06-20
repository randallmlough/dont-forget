// The /api/data write applicator: the transport-agnostic core that decides what
// each PowerSync write op does, plus the shared contracts it exchanges with the
// HTTP shim (lib/api/data) and the pg transaction (./pg-transaction).
//
// This is data-store infrastructure owned by the db layer (ADR-0014): the
// dependency arrow points lib/api -> db, so the Zod batch contract, the DataOp
// type, and the transaction interface all live here, not in lib/api. The core is
// pure (no Request, no pg) and runs against an injected DataTransaction; tests
// provide a fake, production wires it to ./pg-transaction.
//
// Invariants preserved (do not change behavior):
//   - Per-op table allow-list + per-column allow-list (closes the
//     Object.keys(data) -> SQL hole).
//   - Per-row membership authz: active membership == memberships.removed_at IS NULL.
//   - LWW by updated_at; tombstone monotonicity; updated_at clamp to <= now().
//   - item_checks (ADR-0015 / Decision 9): uncheck sets checked_at = NULL, never
//     deletes; one row per item_id.
//   - 4xx for terminal client errors (client discards), 5xx for transient
//     (client retries) — the liveness guarantee.

import { z } from "zod";
import {
	type DataTable,
	isDataTable,
	WRITABLE_COLUMNS,
} from "@/db/schema/postgres/sync-columns";

const opSchema = z.object({
	op: z.enum(["PUT", "PATCH", "DELETE"]),
	table: z.string(),
	id: z.string(),
	data: z.record(z.string(), z.unknown()).default({}),
});

export const batchSchema = z.object({
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
	// decides which based on the table; the transaction performs the SQL. Both
	// stamp updated_at (and deleted_at) with the clamped incoming client clock,
	// never now(), so a stale delete/uncheck loses to a newer write.
	tombstone(table: DataTable, id: string, updatedAt: Date): Promise<void>;
	uncheckItemCheck(id: string, updatedAt: Date): Promise<void>;
};

// Terminal client error (4xx): the client connector discards the op.
export class DataClientError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "DataClientError";
	}
}

export async function applyOp(
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
		// A DELETE/uncheck must carry the client clock so the LWW guard above can
		// compare it: a stale offline delete must not overwrite a newer edit.
		if (!incomingUpdatedAt) {
			throw new DataClientError("DELETE requires updated_at", 400);
		}
		// item_checks (Decision 9): uncheck — keep the row, set checked_at NULL.
		if (table === "item_checks") {
			await tx.uncheckItemCheck(op.id, incomingUpdatedAt);
			return;
		}
		await tx.tombstone(table, op.id, incomingUpdatedAt);
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
	const householdIds = await tx.householdsForOp(op);
	// Fail closed: an op we cannot resolve to any Household is never authorized.
	if (householdIds.length === 0) {
		throw new DataClientError("Could not resolve Household", 403);
	}
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
