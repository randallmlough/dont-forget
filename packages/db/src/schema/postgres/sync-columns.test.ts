import { pgTable, text } from "drizzle-orm/pg-core";
import {
	type DataTable,
	deriveWritableColumns,
	HOUSEHOLD_RESOLUTION,
	isDataTable,
	WRITABLE_COLUMNS,
} from "./sync-columns";

// Guards the schema-derived allow-list: if a column is added to or removed from
// db/schema/postgres/product.ts, this snapshot of the exact snake_case names
// must be updated deliberately (a writable column is part of the /api/data
// security boundary, not an incidental schema change).
const EXPECTED: Record<DataTable, string[]> = {
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

describe("sync-columns WRITABLE_COLUMNS (derived from schema)", () => {
	it("derives exactly the lists/items/item_checks counts", () => {
		expect(WRITABLE_COLUMNS.lists.size).toBe(8);
		expect(WRITABLE_COLUMNS.items.size).toBe(10);
		expect(WRITABLE_COLUMNS.item_checks.size).toBe(5);
	});

	it.each([
		"lists",
		"items",
		"item_checks",
	] as const)("derives the exact snake_case column names for %s", (table) => {
		expect(new Set(WRITABLE_COLUMNS[table])).toEqual(new Set(EXPECTED[table]));
	});
});

describe("sync-columns HOUSEHOLD_RESOLUTION", () => {
	it("maps each table to its authz resolution path", () => {
		expect(HOUSEHOLD_RESOLUTION).toEqual({
			lists: "row-household-id",
			items: "via-list",
			item_checks: "via-item",
		});
	});
});

describe("sync-columns isDataTable", () => {
	it("accepts product tables and rejects everything else", () => {
		expect(isDataTable("lists")).toBe(true);
		expect(isDataTable("items")).toBe(true);
		expect(isDataTable("item_checks")).toBe(true);
		expect(isDataTable("users")).toBe(false);
		expect(isDataTable("secrets")).toBe(false);
	});
});

// A fixture table with one deliberately server-shaped column, so the checker's
// failure modes are proven against a schema the live tables don't have.
const fixture = pgTable("fixture", {
	id: text("id").primaryKey(),
	name: text("name"),
	serverStamp: text("server_stamp"),
});

describe("sync-columns deriveWritableColumns (declaration check)", () => {
	it("returns exactly the client-writable names, excluding server-owned columns", () => {
		expect(
			deriveWritableColumns(
				"fixture",
				fixture,
				["id", "name"],
				["server_stamp"],
			),
		).toEqual(new Set(["id", "name"]));
	});

	it("throws naming an unclassified schema column", () => {
		expect(() =>
			deriveWritableColumns("fixture", fixture, ["id", "name"], []),
		).toThrow(/unclassified schema column\(s\): server_stamp/);
	});

	it("throws naming a declared column missing from the schema", () => {
		expect(() =>
			deriveWritableColumns(
				"fixture",
				fixture,
				["id", "name", "ghost"],
				["server_stamp"],
			),
		).toThrow(/missing from the schema: ghost/);
	});

	it("throws when a column is classified both writable and server-owned", () => {
		expect(() =>
			deriveWritableColumns(
				"fixture",
				fixture,
				["id", "name", "server_stamp"],
				["server_stamp"],
			),
		).toThrow(/both CLIENT_WRITABLE and SERVER_OWNED: server_stamp/);
	});
});
