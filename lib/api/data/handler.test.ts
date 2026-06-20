import {
	DataAuthError,
	type DataOp,
	type DataTransaction,
} from "@/db/server/sync";
import { createApiRequest, readJsonResponse } from "@/lib/test/api/requests";
import { type DataDeps, handleDataUpload } from "./handler";

type FakeRowState = {
	updatedAt: Date | null;
	deletedAt: Date | null;
};

type FakeTransactionConfig = {
	// op.id -> resolved Household ids. Mirrors pgDataTransaction.householdsForOp,
	// which keys off the STORED row's parent by op.id (not the payload parent),
	// so a write to a row in another Household resolves to that Household.
	households?: Record<string, string[]>;
	activeMembers?: Set<string>; // `${userId}:${householdId}`
	stored?: Record<string, FakeRowState>; // `${table}:${id}` -> state
	throwOnQuery?: boolean;
};

type RecordedCall =
	| { kind: "upsert"; table: string; id: string; data: Record<string, unknown> }
	| { kind: "patch"; table: string; id: string; data: Record<string, unknown> }
	| { kind: "tombstone"; table: string; id: string; updatedAt: Date }
	| { kind: "uncheck"; id: string; updatedAt: Date };

function fakeTransaction(config: FakeTransactionConfig) {
	const calls: RecordedCall[] = [];
	const tx: DataTransaction = {
		async householdsForOp(op: DataOp) {
			if (config.throwOnQuery) throw new Error("db down");
			return config.households?.[op.id] ?? [];
		},
		async isActiveMember(userId, householdId) {
			return config.activeMembers?.has(`${userId}:${householdId}`) ?? false;
		},
		async storedRowState(table, id) {
			return config.stored?.[`${table}:${id}`];
		},
		async upsert(table, id, data) {
			calls.push({ kind: "upsert", table, id, data });
		},
		async patch(table, id, data) {
			calls.push({ kind: "patch", table, id, data });
		},
		async tombstone(table, id, updatedAt) {
			calls.push({ kind: "tombstone", table, id, updatedAt });
		},
		async uncheckItemCheck(id, updatedAt) {
			calls.push({ kind: "uncheck", id, updatedAt });
		},
	};
	return { tx, calls };
}

function deps(
	config: FakeTransactionConfig,
	overrides?: Partial<DataDeps>,
): { deps: DataDeps; calls: RecordedCall[] } {
	const { tx, calls } = fakeTransaction(config);
	return {
		calls,
		deps: {
			authenticate: async () => "user_a",
			withTransaction: async (run) => run(tx),
			...overrides,
		},
	};
}

function request(batch: unknown): Request {
	return createApiRequest({ method: "POST", body: { batch } });
}

describe("/api/data handler", () => {
	it("returns 401 when authentication fails", async () => {
		const response = await handleDataUpload(request([]), {
			authenticate: async () => {
				throw new DataAuthError("Invalid Clerk session token");
			},
			withTransaction: async () => {
				throw new Error("should not reach transaction");
			},
		});
		await expect(readJsonResponse(response)).resolves.toMatchObject({
			status: 401,
			body: { error: "Invalid Clerk session token" },
		});
	});

	it("returns 400 for a malformed batch body", async () => {
		const { deps: d } = deps({});
		const response = await handleDataUpload(
			createApiRequest({ method: "POST", body: { batch: "nope" } }),
			d,
		);
		await expect(readJsonResponse(response)).resolves.toMatchObject({
			status: 400,
		});
	});

	it("returns 400 for an unknown table", async () => {
		const { deps: d, calls } = deps({});
		const response = await handleDataUpload(
			request([{ op: "PUT", table: "secrets", id: "x", data: {} }]),
			d,
		);
		await expect(readJsonResponse(response)).resolves.toMatchObject({
			status: 400,
		});
		expect(calls).toHaveLength(0);
	});

	it("returns 400 for a disallowed column", async () => {
		const { deps: d } = deps({
			households: { l1: ["h1"] },
			activeMembers: new Set(["user_a:h1"]),
		});
		const response = await handleDataUpload(
			request([
				{
					op: "PUT",
					table: "lists",
					id: "l1",
					data: { household_id: "h1", evil: "DROP TABLE" },
				},
			]),
			d,
		);
		await expect(readJsonResponse(response)).resolves.toMatchObject({
			status: 400,
		});
	});

	it("returns 403 when the User is not an active Member", async () => {
		const { deps: d } = deps({
			households: { l1: ["h1"] },
			activeMembers: new Set(), // not a member
		});
		const response = await handleDataUpload(
			request([
				{ op: "PUT", table: "lists", id: "l1", data: { household_id: "h1" } },
			]),
			d,
		);
		await expect(readJsonResponse(response)).resolves.toMatchObject({
			status: 403,
		});
	});

	it("returns 500 on a transient db failure", async () => {
		const { deps: d } = deps({ throwOnQuery: true });
		const response = await handleDataUpload(
			request([
				{ op: "PUT", table: "lists", id: "l1", data: { household_id: "h1" } },
			]),
			d,
		);
		await expect(readJsonResponse(response)).resolves.toMatchObject({
			status: 500,
		});
	});

	it("applies an authorized PUT", async () => {
		const { deps: d, calls } = deps({
			households: { l1: ["h1"] },
			activeMembers: new Set(["user_a:h1"]),
		});
		const response = await handleDataUpload(
			request([
				{
					op: "PUT",
					table: "lists",
					id: "l1",
					data: { household_id: "h1", name: "Groceries" },
				},
			]),
			d,
		);
		await expect(readJsonResponse(response)).resolves.toMatchObject({
			status: 200,
			body: { ok: true },
		});
		expect(calls).toEqual([
			{
				kind: "upsert",
				table: "lists",
				id: "l1",
				data: { household_id: "h1", name: "Groceries" },
			},
		]);
	});

	it("skips a stale LWW write", async () => {
		const stored = new Date("2026-06-19T12:00:00Z");
		const { deps: d, calls } = deps({
			households: { l1: ["h1"] },
			activeMembers: new Set(["user_a:h1"]),
			stored: { "lists:l1": { updatedAt: stored, deletedAt: null } },
		});
		const response = await handleDataUpload(
			request([
				{
					op: "PATCH",
					table: "lists",
					id: "l1",
					data: { name: "Stale", updated_at: "2026-06-19T11:00:00Z" },
				},
			]),
			d,
		);
		await expect(readJsonResponse(response)).resolves.toMatchObject({
			status: 200,
		});
		expect(calls).toHaveLength(0); // older op skipped
	});

	it("rejects clearing deleted_at (tombstone monotonicity)", async () => {
		const { deps: d, calls } = deps({
			households: { l1: ["h1"] },
			activeMembers: new Set(["user_a:h1"]),
			stored: {
				"lists:l1": {
					updatedAt: new Date("2026-06-19T10:00:00Z"),
					deletedAt: new Date("2026-06-19T10:00:00Z"),
				},
			},
		});
		const response = await handleDataUpload(
			request([
				{
					op: "PATCH",
					table: "lists",
					id: "l1",
					data: { deleted_at: null, updated_at: "2026-06-19T13:00:00Z" },
				},
			]),
			d,
		);
		await expect(readJsonResponse(response)).resolves.toMatchObject({
			status: 409,
		});
		expect(calls).toHaveLength(0);
	});

	it("clamps a far-future updated_at to <= now()", async () => {
		const { deps: d, calls } = deps({
			households: { l1: ["h1"] },
			activeMembers: new Set(["user_a:h1"]),
		});
		const farFuture = "2999-01-01T00:00:00.000Z";
		const before = Date.now();
		const response = await handleDataUpload(
			request([
				{
					op: "PUT",
					table: "lists",
					id: "l1",
					data: { household_id: "h1", updated_at: farFuture },
				},
			]),
			d,
		);
		const after = Date.now();
		await expect(readJsonResponse(response)).resolves.toMatchObject({
			status: 200,
		});
		expect(calls).toHaveLength(1);
		const call = calls[0];
		if (call.kind !== "upsert") throw new Error("expected upsert");
		const clamped = new Date(call.data.updated_at as string).getTime();
		expect(clamped).toBeLessThan(new Date(farFuture).getTime());
		expect(clamped).toBeGreaterThanOrEqual(before);
		expect(clamped).toBeLessThanOrEqual(after);
	});

	it("unchecks an item_check without deleting the row (Decision 9)", async () => {
		const { deps: d, calls } = deps({
			households: { c1: ["h1"] },
			activeMembers: new Set(["user_a:h1"]),
		});
		const uncheckedAt = "2026-06-19T12:00:00.000Z";
		const response = await handleDataUpload(
			request([
				{
					op: "DELETE",
					table: "item_checks",
					id: "c1",
					data: { updated_at: uncheckedAt },
				},
			]),
			d,
		);
		await expect(readJsonResponse(response)).resolves.toMatchObject({
			status: 200,
		});
		expect(calls).toEqual([
			{ kind: "uncheck", id: "c1", updatedAt: new Date(uncheckedAt) },
		]);
		expect(calls.some((c) => c.kind === "tombstone")).toBe(false);
	});

	it("resolves an item_checks unique(item_id) conflict by LWW", async () => {
		const stored = new Date("2026-06-19T12:00:00Z");
		const { deps: d, calls } = deps({
			households: { c1: ["h1"] },
			activeMembers: new Set(["user_a:h1"]),
			stored: { "item_checks:c1": { updatedAt: stored, deletedAt: null } },
		});
		// A stale check write loses to the stored row.
		const response = await handleDataUpload(
			request([
				{
					op: "PUT",
					table: "item_checks",
					id: "c1",
					data: {
						item_id: "i1",
						checked_at: "2026-06-19T11:00:00Z",
						updated_at: "2026-06-19T11:00:00Z",
					},
				},
			]),
			d,
		);
		await expect(readJsonResponse(response)).resolves.toMatchObject({
			status: 200,
		});
		expect(calls).toHaveLength(0); // stale -> skipped
	});

	// C1: /api/data is product-tables-only. Directory tables (users, households,
	// memberships) have no writable-column entry, so any op targeting them is a
	// terminal 400 (unknown table); their Owner-aware mutations live in the
	// household/member domain services, never here.
	it.each([
		["users", "u1"],
		["households", "h1"],
		["memberships", "m1"],
	])("rejects writes to the directory table %s with a terminal 400", async (table, id) => {
		for (const op of ["PUT", "PATCH", "DELETE"] as const) {
			const { deps: d, calls } = deps({});
			const response = await handleDataUpload(
				request([{ op, table, id, data: {} }]),
				d,
			);
			await expect(readJsonResponse(response)).resolves.toMatchObject({
				status: 400,
			});
			expect(calls).toHaveLength(0);
		}
	});

	// H1: authorize against the row's resolved (stored-parent) Household and fail
	// closed. A Member of Household A must not mutate a row whose stored parent is
	// in Household B by pointing the payload parent at A.
	it("returns 403 when the stored row belongs to another Household", async () => {
		const { deps: d, calls } = deps({
			households: { i1: ["h_b"] }, // stored parent resolves to Household B
			activeMembers: new Set(["user_a:h_a"]), // caller only belongs to A
			stored: {
				"items:i1": {
					updatedAt: new Date("2026-06-19T10:00:00Z"),
					deletedAt: null,
				},
			},
		});
		const response = await handleDataUpload(
			request([
				{
					op: "PATCH",
					table: "items",
					id: "i1",
					// Payload parent points at A, but authz uses the stored parent (B).
					data: { list_id: "list_in_a", name: "hijack" },
				},
			]),
			d,
		);
		await expect(readJsonResponse(response)).resolves.toMatchObject({
			status: 403,
		});
		expect(calls).toHaveLength(0);
	});

	it("returns 403 when the op resolves to no Household (fail closed)", async () => {
		const { deps: d, calls } = deps({
			households: {}, // unresolvable -> []
			activeMembers: new Set(["user_a:h_a"]),
		});
		const response = await handleDataUpload(
			request([
				{ op: "PUT", table: "lists", id: "orphan", data: { name: "x" } },
			]),
			d,
		);
		await expect(readJsonResponse(response)).resolves.toMatchObject({
			status: 403,
		});
		expect(calls).toHaveLength(0);
	});

	// H3: DELETE/uncheck must carry the client clock so the LWW guard fires.
	it("returns 400 for a DELETE without updated_at", async () => {
		const { deps: d, calls } = deps({
			households: { l1: ["h1"] },
			activeMembers: new Set(["user_a:h1"]),
			stored: {
				"lists:l1": {
					updatedAt: new Date("2026-06-19T10:00:00Z"),
					deletedAt: null,
				},
			},
		});
		const response = await handleDataUpload(
			request([{ op: "DELETE", table: "lists", id: "l1", data: {} }]),
			d,
		);
		await expect(readJsonResponse(response)).resolves.toMatchObject({
			status: 400,
		});
		expect(calls).toHaveLength(0);
	});

	it("stamps tombstone/uncheck with the clamped incoming clock, not now()", async () => {
		const at = "2026-06-19T11:00:00.000Z";
		const { deps: d, calls } = deps({
			households: { c1: ["h1"] },
			activeMembers: new Set(["user_a:h1"]),
		});
		const response = await handleDataUpload(
			request([
				{
					op: "DELETE",
					table: "item_checks",
					id: "c1",
					data: { updated_at: at },
				},
			]),
			d,
		);
		await expect(readJsonResponse(response)).resolves.toMatchObject({
			status: 200,
		});
		expect(calls).toEqual([
			{ kind: "uncheck", id: "c1", updatedAt: new Date(at) },
		]);
	});
});
