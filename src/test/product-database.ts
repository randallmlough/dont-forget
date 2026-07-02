import Database from "better-sqlite3";
import type {
	ProductDatabase,
	ProductQuerier,
	ProductRow,
	ProductWriteResult,
} from "@/client/lib/product-database";
import { timestampMillisToSqlText } from "@/lib/services/shared/sql-timestamp";

// A real in-memory SQLite (better-sqlite3) standing in for the on-device
// PowerSync database in service tests. The dialect and `?`-positional
// placeholders match PowerSync's op-sqlite, so the item/list services run their
// production SQL verbatim — catching SQL and row-mapping bugs a hand-rolled
// mock cannot. The DDL mirrors `lib/powersync/schema.ts` (and PR-A's Postgres
// product schema): timestamps are ISO text, `position` is REAL, and item_checks
// carries the Decision-9 `item_id` UNIQUE invariant the server enforces — so a
// service that ever wrote two checks for one Item would fail loudly here.
const PRODUCT_DDL = `
  CREATE TABLE lists (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT,
    deleted_at TEXT
  );
  CREATE TABLE items (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity TEXT,
    notes TEXT,
    position REAL NOT NULL,
    created_by_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE TABLE item_checks (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL UNIQUE,
    checked_at TEXT,
    checked_by_user_id TEXT,
    updated_at TEXT NOT NULL
  );
`;

export type SeedListInput = {
	id: string;
	householdId: string;
	name?: string;
	createdByUserId?: string;
	createdAtMillis?: number;
	updatedAtMillis?: number;
	archivedAtMillis?: number | null;
	deletedAtMillis?: number | null;
};

export type SeedItemInput = {
	id: string;
	listId: string;
	name?: string;
	quantity?: string | null;
	notes?: string | null;
	position?: number;
	createdByUserId?: string;
	createdAtMillis?: number;
	updatedAtMillis?: number;
	deletedAtMillis?: number | null;
};

export type SeedItemCheckInput = {
	id: string;
	itemId: string;
	checkedAtMillis?: number | null;
	checkedByUserId?: string | null;
	updatedAtMillis?: number;
};

export type TestProductDatabase = ProductDatabase & {
	raw: Database.Database;
	close(): void;
	seedList(input: SeedListInput): void;
	seedItem(input: SeedItemInput): void;
	seedItemCheck(input: SeedItemCheckInput): void;
};

export function createTestProductDatabase(): TestProductDatabase {
	const sqlite = new Database(":memory:");
	sqlite.exec(PRODUCT_DDL);
	// Deterministic monotonically-increasing clock for seeded rows so LWW/sort
	// ordering in tests is stable without reaching for Date.now().
	let seedClock = 1_700_000_000_000;
	const nextSeedMillis = () => {
		seedClock += 1000;
		return seedClock;
	};
	const text = (millis: number | null | undefined): string | null =>
		millis === null || millis === undefined
			? null
			: timestampMillisToSqlText(millis);

	const querier = querierFrom(sqlite);

	return {
		...querier,
		async writeTransaction(run) {
			// better-sqlite3 is synchronous and rejects async transaction callbacks,
			// so drive BEGIN/COMMIT/ROLLBACK manually. The services never nest
			// transactions, so a single level is enough.
			sqlite.exec("BEGIN");
			try {
				const result = await run(querier);
				sqlite.exec("COMMIT");
				return result;
			} catch (error) {
				sqlite.exec("ROLLBACK");
				throw error;
			}
		},
		raw: sqlite,
		close: () => sqlite.close(),
		seedList(input) {
			const createdAt = input.createdAtMillis ?? nextSeedMillis();
			sqlite
				.prepare(
					`INSERT INTO lists (id, household_id, name, created_by_user_id, created_at, updated_at, archived_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.run(
					input.id,
					input.householdId,
					input.name ?? "List",
					input.createdByUserId ?? "usr_seed",
					text(createdAt),
					text(input.updatedAtMillis ?? createdAt),
					text(input.archivedAtMillis ?? null),
					text(input.deletedAtMillis ?? null),
				);
		},
		seedItem(input) {
			const createdAt = input.createdAtMillis ?? nextSeedMillis();
			sqlite
				.prepare(
					`INSERT INTO items (id, list_id, name, quantity, notes, position, created_by_user_id, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.run(
					input.id,
					input.listId,
					input.name ?? "Item",
					input.quantity ?? null,
					input.notes ?? null,
					input.position ?? 0,
					input.createdByUserId ?? "usr_seed",
					text(createdAt),
					text(input.updatedAtMillis ?? createdAt),
					text(input.deletedAtMillis ?? null),
				);
		},
		seedItemCheck(input) {
			const updatedAt = input.updatedAtMillis ?? nextSeedMillis();
			sqlite
				.prepare(
					`INSERT INTO item_checks (id, item_id, checked_at, checked_by_user_id, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
				)
				.run(
					input.id,
					input.itemId,
					text(input.checkedAtMillis ?? null),
					input.checkedByUserId ?? null,
					text(updatedAt),
				);
		},
	};
}

function querierFrom(sqlite: Database.Database): ProductQuerier {
	return {
		async getAll<Row extends ProductRow = ProductRow>(
			sql: string,
			params?: readonly unknown[],
		): Promise<Row[]> {
			return sqlite.prepare(sql).all(...bind(params)) as Row[];
		},
		async getOptional<Row extends ProductRow = ProductRow>(
			sql: string,
			params?: readonly unknown[],
		): Promise<Row | null> {
			return (sqlite.prepare(sql).get(...bind(params)) ?? null) as Row | null;
		},
		async execute(
			sql: string,
			params?: readonly unknown[],
		): Promise<ProductWriteResult> {
			// PowerSync's local tables are SQLite VIEWS over `ps_data__*` with
			// INSTEAD OF triggers, so sqlite3_changes() (QueryResult.rowsAffected)
			// is always 0 for INSERT/UPDATE/DELETE on them. Mirror that here: run
			// the statement so the write still persists to these real tables, but
			// report rowsAffected: 0 — so a service that leans on rowsAffected is
			// caught by tests instead of passing on better-sqlite3's real count.
			sqlite.prepare(sql).run(...bind(params));
			return { rowsAffected: 0, rows: [] };
		},
	};
}

// better-sqlite3 binds `string | number | bigint | Buffer | null` — never
// `undefined`. The services only ever pass string/number/null params.
function bind(params: readonly unknown[] | undefined): unknown[] {
	return params ? [...params] : [];
}
