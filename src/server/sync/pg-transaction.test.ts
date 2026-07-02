import type { DataOp } from "@/server/sync/applicator";
import {
	type PgQueryClient,
	pgDataTransaction,
} from "@/server/sync/pg-transaction";
import { handleDataUpload } from "@/server/data/api";
import { createApiRequest, readJsonResponse } from "@/lib/test/api/requests";

function request(batch: unknown): Request {
	return createApiRequest({ method: "POST", body: { batch } });
}

describe("pgDataTransaction Household resolution", () => {
	// H1 (resolver precedence): these drive pgDataTransaction.householdsForOp
	// through a fake PgQueryClient to pin that the resolver authorizes against the
	// row's STORED parent rather than the caller-supplied payload parent, and
	// unions the stored AND destination Household so cross-Household moves are
	// blocked — the cross-Household-write fix.
	it.each([
		["lists", { household_id: "h_a", name: "x" }],
		["items", { list_id: "list_in_a", name: "x" }],
		["item_checks", { item_id: "item_in_a" }],
	] as const)("unions %s stored AND destination Household so cross-Household moves are blocked", async (table, data) => {
		const client: PgQueryClient = {
			// The stored SELECT is keyed by op.id (-> Household B, the anti-hijack
			// parent); the destination SELECT for the payload scoping FK resolves to
			// Household A. The resolver must return BOTH so assertAuthorized checks
			// the caller belongs to A and B — blocking a B-Member from moving the
			// row into A (or an A-Member from hijacking the B row).
			async query(_text, params) {
				return params?.[0] === "row1"
					? { rows: [{ household_id: "h_b" }] }
					: { rows: [{ household_id: "h_a" }] };
			},
		};
		const op: DataOp = { op: "PATCH", table, id: "row1", data: { ...data } };
		const resolved = await pgDataTransaction(client).householdsForOp(table, op);
		// Order-insensitive: stored parent is always included (anti-hijack), and
		// the destination parent is unioned in (anti-move).
		expect(new Set(resolved)).toEqual(new Set(["h_b", "h_a"]));
	});

	// Guards the create branch the H1 fix added: a brand-new row has no stored row
	// yet, so authz resolves its Household from the payload parent. If a later
	// refactor made the resolver stored-only, every create would resolve to [] ->
	// fail-closed 403 -> all creates break. (Green both pre- and post-H1 by design:
	// it guards the create path, not the stored-vs-payload precedence above.)
	it("resolves a brand-new row's Household from the payload parent (create path)", async () => {
		const client: PgQueryClient = {
			async query() {
				return { rows: [] }; // no stored row -> brand-new create
			},
		};
		const op: DataOp = {
			op: "PUT",
			table: "lists",
			id: "new1",
			data: { household_id: "h_a", name: "x" },
		};
		await expect(
			pgDataTransaction(client).householdsForOp("lists", op),
		).resolves.toEqual(["h_a"]);
	});

	// H1 (cross-Household move, end to end): an A-Member PATCHes an existing item
	// whose STORED parent is in Household A but whose payload list_id points at a
	// List in Household B (the caller is NOT a Member of B). The real
	// pgDataTransaction union resolver returns BOTH A and B; assertAuthorized
	// fails closed on B -> 403, and no UPDATE is issued. This drives the real
	// resolver through a fake PgQueryClient so the union actually runs.
	it("blocks moving an existing item into a Household the caller is not a Member of", async () => {
		const writes: { text: string; params?: unknown[] }[] = [];
		const client: PgQueryClient = {
			async query(text, params) {
				// Stored item lookup (keyed by op.id) -> Household A.
				if (
					text.includes("FROM items i JOIN lists l") &&
					params?.[0] === "i1"
				) {
					return { rows: [{ household_id: "h_a" }] };
				}
				// Destination List lookup (payload list_id) -> Household B.
				if (
					text.includes("FROM lists WHERE id = $1") &&
					params?.[0] === "list_in_b"
				) {
					return { rows: [{ household_id: "h_b" }] };
				}
				// Active membership: caller belongs to A only, never B.
				if (text.includes("FROM memberships")) {
					const isMemberOfA = params?.[0] === "user_a" && params?.[1] === "h_a";
					return { rows: isMemberOfA ? [{ "?column?": 1 }] : [] };
				}
				// Any write reaching the db is a failure for this test.
				writes.push({ text, params });
				return { rows: [] };
			},
		};
		const response = await handleDataUpload(
			request([
				{
					op: "PATCH",
					table: "items",
					id: "i1",
					data: { list_id: "list_in_b", name: "moved" },
				},
			]),
			{
				authenticate: async () => "user_a",
				withTransaction: async (run) => run(pgDataTransaction(client)),
			},
		);
		await expect(readJsonResponse(response)).resolves.toMatchObject({
			status: 403,
		});
		expect(writes).toHaveLength(0);
	});
});

describe("pgDataTransaction SQL shape", () => {
	// H2: item_checks has UNIQUE(item_id); a new synthetic id can collide on an
	// existing Item's row. The production upsert must conflict on item_id (not the
	// id PK) and merge last-writer-wins by updated_at. No embedded Postgres
	// substrate exists in this repo, so this asserts the generated SQL shape; the
	// runtime no-500/LWW behavior is covered once a PG-backed test exists.
	it("builds the item_checks upsert with ON CONFLICT (item_id) + updated_at LWW guard", async () => {
		const queries: { text: string; params?: unknown[] }[] = [];
		const client: PgQueryClient = {
			async query(text, params) {
				queries.push({ text, params });
				return { rows: [] };
			},
		};
		const tx = pgDataTransaction(client);
		await tx.upsert("item_checks", "c1", {
			item_id: "i1",
			checked_at: "2026-06-19T11:00:00.000Z",
			updated_at: "2026-06-19T11:00:00.000Z",
		});

		expect(queries).toHaveLength(1);
		const sql = queries[0].text;
		expect(sql).toContain("ON CONFLICT (item_id)");
		expect(sql).not.toContain("ON CONFLICT (id)");
		expect(sql).toContain(
			"WHERE item_checks.updated_at <= EXCLUDED.updated_at",
		);
		// item_id is the conflict key and must not be in the DO UPDATE SET list.
		expect(sql).not.toContain("item_id = EXCLUDED.item_id");
		expect(sql).toContain("checked_at = EXCLUDED.checked_at");
	});

	it("builds non-item_checks upserts with ON CONFLICT (id)", async () => {
		const queries: { text: string; params?: unknown[] }[] = [];
		const client: PgQueryClient = {
			async query(text, params) {
				queries.push({ text, params });
				return { rows: [] };
			},
		};
		const tx = pgDataTransaction(client);
		await tx.upsert("lists", "l1", { household_id: "h1", name: "Groceries" });

		expect(queries[0].text).toContain("ON CONFLICT (id)");
		expect(queries[0].text).not.toContain("updated_at <= EXCLUDED.updated_at");
	});

	// FIX C: the JS-level LWW check reads a stale row under READ COMMITTED, so two
	// concurrent uploads can both pass it; only an SQL `updated_at <= $N` predicate
	// (re-evaluated by EvalPlanQual after the lock releases) drops the stale write.
	// These assert patch/tombstone/uncheck now carry that guard.
	it("guards patch with updated_at <= $ when the payload carries a clock", async () => {
		const queries: { text: string; params?: unknown[] }[] = [];
		const client: PgQueryClient = {
			async query(text, params) {
				queries.push({ text, params });
				return { rows: [] };
			},
		};
		const clock = "2026-06-19T11:00:00.000Z";
		await pgDataTransaction(client).patch("lists", "l1", {
			name: "Groceries",
			updated_at: clock,
		});

		expect(queries).toHaveLength(1);
		expect(queries[0].text).toContain("updated_at <= $");
		expect(queries[0].params).toContain(clock);
	});

	it("omits the patch LWW guard when the payload has no updated_at", async () => {
		const queries: { text: string; params?: unknown[] }[] = [];
		const client: PgQueryClient = {
			async query(text, params) {
				queries.push({ text, params });
				return { rows: [] };
			},
		};
		await pgDataTransaction(client).patch("lists", "l1", { name: "Groceries" });

		expect(queries).toHaveLength(1);
		expect(queries[0].text).not.toContain("updated_at <=");
		expect(queries[0].text).toContain("WHERE id = $2");
	});

	it("guards tombstone with WHERE id = $1 AND updated_at <= $2", async () => {
		const queries: { text: string; params?: unknown[] }[] = [];
		const client: PgQueryClient = {
			async query(text, params) {
				queries.push({ text, params });
				return { rows: [] };
			},
		};
		const at = new Date("2026-06-19T11:00:00.000Z");
		await pgDataTransaction(client).tombstone("lists", "l1", at);

		expect(queries).toHaveLength(1);
		expect(queries[0].text).toContain("WHERE id = $1 AND updated_at <= $2");
	});

	it("guards uncheckItemCheck with updated_at <= $2", async () => {
		const queries: { text: string; params?: unknown[] }[] = [];
		const client: PgQueryClient = {
			async query(text, params) {
				queries.push({ text, params });
				return { rows: [] };
			},
		};
		const at = new Date("2026-06-19T11:00:00.000Z");
		await pgDataTransaction(client).uncheckItemCheck("c1", at);

		expect(queries).toHaveLength(1);
		expect(queries[0].text).toContain("updated_at <= $2");
	});
});
