// Allow-lists and Household-resolution paths for the /api/data write applicator.
// The packages/db workspace owns this data-store infrastructure (ADR-0014);
// apps/api consumes the applicator through @dont-forget/db instead of
// re-declaring its contract.
//
// WRITABLE_COLUMNS is explicitly declared and checked against the Drizzle
// schema at module load. A column added to the schema must be classified as
// client-writable or server-owned before /api/data can import this module.

import { getTableColumns, type Table } from "drizzle-orm";
import { itemChecks, items, lists } from "./product";

export type DataTable = "lists" | "items" | "item_checks";

// Columns clients may write via /api/data, per table, as snake_case SQL names
// (incoming op.data keys). This is the /api/data security boundary: adding a
// name here is a deliberate decision to accept client writes to that column.
const CLIENT_WRITABLE: Record<DataTable, readonly string[]> = {
	lists: [
		"id",
		"household_id",
		"name",
		"created_by_user_id",
		"created_at",
		"updated_at",
		"archived_at",
		"deleted_at",
	],
	items: [
		"id",
		"list_id",
		"name",
		"quantity",
		"notes",
		"position",
		"created_by_user_id",
		"created_at",
		"updated_at",
		"deleted_at",
	],
	item_checks: [
		"id",
		"item_id",
		"checked_at",
		"checked_by_user_id",
		"updated_at",
	],
};

// Server-managed columns that must NOT be client-writable, per table. Empty
// today (the schema has zero server-managed columns). A future server-owned
// column (e.g. a version/seq stamp) is declared here.
const SERVER_OWNED: Record<DataTable, readonly string[]> = {
	lists: [],
	items: [],
	item_checks: [],
};

// Checks the declarations exhaustively against the Drizzle table and returns
// the client-writable set. getTableColumns(...).name is the snake_case SQL
// column name (not the JS key), which is what incoming op.data keys are.
// Throws at module load on any unclassified, stale, or doubly-classified
// column, so a schema change can never silently widen the client-writable
// surface. Exported for its failure-mode tests only.
export function deriveWritableColumns(
	tableName: string,
	table: Table,
	clientWritable: readonly string[],
	serverOwned: readonly string[],
): ReadonlySet<string> {
	const schemaColumns = new Set(
		Object.values(getTableColumns(table)).map((column) => column.name),
	);
	const declared = new Set([...clientWritable, ...serverOwned]);
	const unclassified = [...schemaColumns].filter((name) => !declared.has(name));
	if (unclassified.length > 0) {
		throw new Error(
			`sync-columns: table "${tableName}" has unclassified schema column(s): ${unclassified.join(", ")}. ` +
				"Classify each in CLIENT_WRITABLE (clients may write it via /api/data) or " +
				"SERVER_OWNED (server-managed; never client-writable) in sync-columns.ts.",
		);
	}
	const stale = [...declared].filter((name) => !schemaColumns.has(name));
	if (stale.length > 0) {
		throw new Error(
			`sync-columns: table "${tableName}" declares column(s) missing from the schema: ${stale.join(", ")}. ` +
				"Remove them from CLIENT_WRITABLE / SERVER_OWNED in sync-columns.ts.",
		);
	}
	const serverOwnedSet = new Set(serverOwned);
	const overlap = clientWritable.filter((name) => serverOwnedSet.has(name));
	if (overlap.length > 0) {
		throw new Error(
			`sync-columns: table "${tableName}" classifies column(s) as both CLIENT_WRITABLE and SERVER_OWNED: ${overlap.join(", ")}. Pick one.`,
		);
	}
	return new Set(clientWritable);
}

// Writable column names per table. Any incoming data key outside this set is
// rejected (closes the Object.keys(data) -> SQL injection-of-columns hole).
// Only product tables are writable here; users/households/memberships are
// directory tables whose Owner-aware mutations live in the household and member
// domain services, never on /api/data.
export const WRITABLE_COLUMNS: Record<DataTable, ReadonlySet<string>> = {
	lists: deriveWritableColumns(
		"lists",
		lists,
		CLIENT_WRITABLE.lists,
		SERVER_OWNED.lists,
	),
	items: deriveWritableColumns(
		"items",
		items,
		CLIENT_WRITABLE.items,
		SERVER_OWNED.items,
	),
	item_checks: deriveWritableColumns(
		"item_checks",
		itemChecks,
		CLIENT_WRITABLE.item_checks,
		SERVER_OWNED.item_checks,
	),
};

// How each table resolves the Household(s) a write touches, for membership authz.
//   - "row-household-id": household_id is a column on the row itself.
//   - "via-list": items resolve through list_id -> lists.household_id.
//   - "via-item": item_checks resolve through item_id -> items.list_id ->
//     lists.household_id.
// This is a 3-row authz policy, kept explicit (not derived from FK shape).
export type HouseholdResolution = "row-household-id" | "via-list" | "via-item";

export const HOUSEHOLD_RESOLUTION: Record<DataTable, HouseholdResolution> = {
	lists: "row-household-id",
	items: "via-list",
	item_checks: "via-item",
};

export function isDataTable(value: string): value is DataTable {
	return value in WRITABLE_COLUMNS;
}
