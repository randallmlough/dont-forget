// Allow-lists and Household-resolution paths for the /api/data write applicator.
// The db layer owns this data-store infrastructure (ADR-0014); the applicator in
// db/server/sync imports it downward, and lib/api never re-declares it.
//
// WRITABLE_COLUMNS is DERIVED from the Drizzle schema so the allow-list cannot
// drift from the actual columns: a column added to the schema is writable unless
// it is named in EXCLUDE.

import { getTableColumns, type Table } from "drizzle-orm";
import { itemChecks, items, lists } from "./product";

export type DataTable = "lists" | "items" | "item_checks";

// Server-managed columns that must NOT be client-writable, per table. Empty today
// (the schema has zero server-managed columns: verified 8/10/5). A future
// server-owned column (e.g. a version/seq stamp) MUST be added here to stay
// non-writable; otherwise it would be allow-by-default from the schema.
const EXCLUDE: Record<DataTable, ReadonlySet<string>> = {
	lists: new Set(),
	items: new Set(),
	item_checks: new Set(),
};

// getTableColumns(...).name is the snake_case SQL column name (not the JS key),
// which is what incoming op.data keys are. Allow-by-default minus EXCLUDE.
function writable(
	table: Table,
	exclude: ReadonlySet<string>,
): ReadonlySet<string> {
	return new Set(
		Object.values(getTableColumns(table))
			.map((column) => column.name)
			.filter((name) => !exclude.has(name)),
	);
}

// Writable column names per table. Any incoming data key outside this set is
// rejected (closes the Object.keys(data) -> SQL injection-of-columns hole).
// Only product tables are writable here; users/households/memberships are
// directory tables whose Owner-aware mutations live in the household and member
// domain services, never on /api/data.
export const WRITABLE_COLUMNS: Record<DataTable, ReadonlySet<string>> = {
	lists: writable(lists, EXCLUDE.lists),
	items: writable(items, EXCLUDE.items),
	item_checks: writable(itemChecks, EXCLUDE.item_checks),
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
