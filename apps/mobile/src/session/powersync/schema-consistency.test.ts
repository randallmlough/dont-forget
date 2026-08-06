import { readFileSync } from "node:fs";
import path from "node:path";
import { ColumnType } from "@powersync/common";
import { type Table as DrizzleTable, getTableColumns } from "drizzle-orm";
import { parse } from "yaml";
import { z } from "zod";
import {
	households,
	itemChecks,
	items,
	lists,
	memberships,
	users,
} from "@dont-forget/db/schema";
import { AppSchema } from "./schema";

// One logical schema, four hand-kept artifacts: the Drizzle Postgres schema,
// this client schema, the sync streams, and the logical-replication
// publication (ADR-0018: "Schema changes have three coordinated edit points").
// This test mechanically ties them together so a hand-edit that drifts fails
// `make verify` instead of shipping.

const SYNCED_TABLES: Record<string, DrizzleTable> = {
	users,
	households,
	memberships,
	lists,
	items,
	item_checks: itemChecks,
};

// Published-table columns deliberately excluded from explicit stream
// projections because the client schema does not model them.
const SERVER_ONLY_SYNCED_COLUMNS: Record<string, string[]> = {
	users: ["created_at", "updated_at"],
};

// Tables that must NEVER sync to devices (Invitation and Household Join Code
// data stays server-side; see 0001_powersync_publication.sql).
const UNPUBLISHED_TABLES = [
	"invitations",
	"household_join_codes",
	"household_join_code_uses",
];

// How PowerSync serializes each Postgres type to the client-side SQLite type
// (https://docs.powersync.com/usage/sync-rules/types): bigint -> integer
// epoch-millis, timestamptz -> ISO-8601-compatible text, double precision ->
// real. Any new Postgres type used by a synced table must be added here.
const PG_TYPE_TO_CLIENT_TYPE: Record<string, ColumnType> = {
	text: ColumnType.TEXT,
	bigint: ColumnType.INTEGER,
	"timestamp with time zone": ColumnType.TEXT,
	"double precision": ColumnType.REAL,
};

const clientTables = AppSchema.toJSON().tables;

const syncConfigSchema = z.object({
	streams: z.record(z.string(), z.object({ queries: z.array(z.string()) })),
});

type SyncStreams = z.infer<typeof syncConfigSchema>["streams"];

const syncConfig = syncConfigSchema.parse(
	parse(
		readFileSync(
			path.resolve(
				__dirname,
				"../../../../../infra/powersync/sync-config.yaml",
			),
			"utf8",
		),
	),
);

const publicationSql = readFileSync(
	require.resolve(
		"@dont-forget/db/migrations/postgres/0001_powersync_publication.sql",
	),
	"utf8",
);

function publicationTablesFromSql(sql: string): string[] {
	const match = /CREATE PUBLICATION powersync FOR TABLE ([^;]+);/.exec(sql);
	if (!match) {
		throw new Error("0001_powersync_publication.sql: publication not found");
	}
	return match[1].split(",").map((table) => table.trim());
}

function syncedTableFor(tableName: string): DrizzleTable {
	const table = SYNCED_TABLES[tableName];
	if (!table) {
		throw new Error(
			`${tableName}: missing from SYNCED_TABLES — add it so schema consistency can compare Drizzle columns`,
		);
	}
	return table;
}

function drizzleColumnNames(table: DrizzleTable): string[] {
	return Object.values(getTableColumns(table)).map((column) => column.name);
}

type StreamProjection = { stream: string; table: string; columns: string[] };

// Each stream's TOP-LEVEL projection only. The regex is anchored at the start
// of the query so the membership-scoping subqueries in WHERE clauses
// (`SELECT id FROM users WHERE clerk_user_id = auth.user_id()`) are never
// mistaken for projections. `SELECT *` expands to the Drizzle column list —
// that is what PowerSync publishes for `*`.
function streamProjectionsFromStreams(
	streams: SyncStreams,
): StreamProjection[] {
	return Object.entries(streams).flatMap(([stream, { queries }]) =>
		queries.map((query) => {
			const match = /^SELECT\s+(.*?)\s+FROM\s+(\w+)/is.exec(query);
			if (!match) {
				throw new Error(`stream ${stream}: unparseable query: ${query}`);
			}
			const [, selectList, table] = match;
			const drizzleTable = syncedTableFor(table);
			const columns =
				selectList.trim() === "*"
					? drizzleColumnNames(drizzleTable)
					: selectList.split(",").map((column) => column.trim());
			return { stream, table, columns };
		}),
	);
}

describe("PowerSync schema consistency", () => {
	it("client schema models exactly the tables the publication replicates", () => {
		expect([...clientTables.map((table) => table.name)].sort()).toEqual(
			[...publicationTablesFromSql(publicationSql)].sort(),
		);
	});

	it("keeps Invitation and Household Join Code tables unpublished", () => {
		for (const table of UNPUBLISHED_TABLES) {
			expect(publicationTablesFromSql(publicationSql)).not.toContain(table);
		}
	});

	it("declares each client column with the type PowerSync emits for its Postgres column", () => {
		const problems: string[] = [];
		for (const table of clientTables) {
			const pgColumns = new Map(
				Object.values(getTableColumns(syncedTableFor(table.name))).map(
					(column) => [column.name, column.getSQLType()],
				),
			);
			for (const column of table.columns) {
				const pgType = pgColumns.get(column.name);
				if (pgType === undefined) {
					problems.push(
						`${table.name}.${column.name}: modeled on the client but missing from the Postgres schema`,
					);
					continue;
				}
				const expected = PG_TYPE_TO_CLIENT_TYPE[pgType];
				if (expected === undefined) {
					problems.push(
						`${table.name}.${column.name}: unmapped Postgres type "${pgType}" — extend PG_TYPE_TO_CLIENT_TYPE`,
					);
					continue;
				}
				if (column.type !== expected) {
					problems.push(
						`${table.name}.${column.name}: client declares ${column.type}, but Postgres "${pgType}" syncs as ${expected}`,
					);
				}
			}
		}
		expect(problems).toEqual([]);
	});

	it("streams publish exactly the columns the client models, plus id", () => {
		const problems: string[] = [];
		for (const { stream, table, columns } of streamProjectionsFromStreams(
			syncConfig.streams,
		)) {
			const published = new Set(columns);
			if (!published.delete("id")) {
				problems.push(`${stream}: does not publish ${table}.id`);
			}
			const clientTable = clientTables.find((t) => t.name === table);
			if (!clientTable) {
				problems.push(`${stream}: table ${table} is not in the client schema`);
				continue;
			}
			const modeled = new Set(clientTable.columns.map((column) => column.name));
			for (const name of published) {
				if (!modeled.has(name)) {
					problems.push(
						`${stream}: publishes ${table}.${name}, which the client schema does not model`,
					);
				}
			}
			for (const name of modeled) {
				if (!published.has(name)) {
					problems.push(
						`${stream}: does not publish ${table}.${name}, which the client schema models`,
					);
				}
			}
		}
		expect(problems).toEqual([]);
	});

	it("keeps synced Drizzle columns either streamed or explicitly server-only", () => {
		const problems: string[] = [];
		const projections = streamProjectionsFromStreams(syncConfig.streams);

		for (const [table, drizzleTable] of Object.entries(SYNCED_TABLES)) {
			const drizzleColumns = new Set(drizzleColumnNames(drizzleTable));
			const expectedColumns = new Set(["id"]);
			for (const projection of projections) {
				if (projection.table !== table) {
					continue;
				}
				for (const column of projection.columns) {
					expectedColumns.add(column);
				}
			}
			for (const column of SERVER_ONLY_SYNCED_COLUMNS[table] ?? []) {
				expectedColumns.add(column);
			}
			for (const column of drizzleColumns) {
				if (!expectedColumns.has(column)) {
					problems.push(
						`${table}.${column}: in Drizzle schema but not streamed or allowlisted as server-only`,
					);
				}
			}
			for (const column of expectedColumns) {
				if (!drizzleColumns.has(column)) {
					problems.push(
						`${table}.${column}: streamed or allowlisted but missing from Drizzle schema`,
					);
				}
			}
		}

		for (const [table, columns] of Object.entries(SERVER_ONLY_SYNCED_COLUMNS)) {
			const drizzleColumns = new Set(drizzleColumnNames(syncedTableFor(table)));
			for (const column of columns) {
				if (!drizzleColumns.has(column)) {
					problems.push(
						`${table}.${column}: allowlisted as server-only but missing from Drizzle schema`,
					);
				}
			}
		}

		expect(problems).toEqual([]);
	});

	it("publishes every client-modeled table through at least one stream", () => {
		const streamed = new Set(
			streamProjectionsFromStreams(syncConfig.streams).map(
				(projection) => projection.table,
			),
		);
		expect(
			clientTables
				.map((table) => table.name)
				.filter((name) => !streamed.has(name)),
		).toEqual([]);
	});

	it("rejects a migration SQL file without the powersync publication", () => {
		expect(() =>
			publicationTablesFromSql("CREATE TABLE users (id text);"),
		).toThrow(/publication not found/);
	});

	it("rejects a stream query that cannot be parsed", () => {
		expect(() =>
			streamProjectionsFromStreams({
				broken: { queries: ["DELETE FROM users"] },
			}),
		).toThrow(/stream broken: unparseable query/);
	});

	it("rejects a stream table missing from the synced-table map", () => {
		expect(() =>
			streamProjectionsFromStreams({
				broken: { queries: ["SELECT * FROM widgets"] },
			}),
		).toThrow(
			/widgets: missing from SYNCED_TABLES — add it so schema consistency can compare Drizzle columns/,
		);
	});
});
