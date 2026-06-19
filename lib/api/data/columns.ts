// Allow-lists and Household-resolution paths for the /api/data write applicator.
// These mirror the pg schema (db/schema/postgres/*) exactly and are kept as
// data so the handler stays readable and tests can assert the allow-list.

export type DataTable =
	| "users"
	| "households"
	| "memberships"
	| "lists"
	| "items"
	| "item_checks";

// Writable column names per table. Any incoming data key outside this set is
// rejected (closes the Object.keys(data) -> SQL injection-of-columns hole).
export const WRITABLE_COLUMNS: Record<DataTable, ReadonlySet<string>> = {
	users: new Set([
		"id",
		"clerk_user_id",
		"email",
		"first_name",
		"last_name",
		"display_name",
		"active_household_id",
		"created_at",
		"updated_at",
	]),
	households: new Set([
		"id",
		"name",
		"created_by_user_id",
		"created_at",
		"deleted_at",
	]),
	memberships: new Set([
		"id",
		"household_id",
		"user_id",
		"role",
		"joined_at",
		"removed_at",
	]),
	lists: new Set([
		"id",
		"household_id",
		"name",
		"created_by_user_id",
		"created_at",
		"updated_at",
		"archived_at",
		"deleted_at",
	]),
	items: new Set([
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
	]),
	item_checks: new Set([
		"id",
		"item_id",
		"checked_at",
		"checked_by_user_id",
		"updated_at",
	]),
};

// How each table resolves the Household(s) a write touches, for membership authz.
//   - "row-household-id": household_id is a column on the row itself.
//   - "via-list": items resolve through list_id -> lists.household_id.
//   - "via-item": item_checks resolve through item_id -> items.list_id ->
//     lists.household_id.
//   - "unscoped": not membership-scoped (users, households).
export type HouseholdResolution =
	| "row-household-id"
	| "via-list"
	| "via-item"
	| "unscoped";

export const HOUSEHOLD_RESOLUTION: Record<DataTable, HouseholdResolution> = {
	users: "unscoped",
	households: "unscoped",
	memberships: "row-household-id",
	lists: "row-household-id",
	items: "via-list",
	item_checks: "via-item",
};

export function isDataTable(value: string): value is DataTable {
	return value in WRITABLE_COLUMNS;
}
