import { column, Schema, Table } from "@powersync/common";

// Client column types mirror what PowerSync serializes for each Postgres type
// (https://docs.powersync.com/usage/sync-rules/types): product timestamps are
// timestamptz -> ISO-8601-compatible text (column.text); directory timestamps
// are bigint epoch-millis -> integer client columns. schema-consistency.test.ts
// mechanically enforces agreement with src/server/db/schema/postgres,
// infra/powersync/sync-config.yaml, and the powersync publication.
const users = new Table({
	clerk_user_id: column.text,
	email: column.text,
	first_name: column.text,
	last_name: column.text,
	display_name: column.text,
	active_household_id: column.text,
});

const households = new Table({
	name: column.text,
	created_by_user_id: column.text,
	created_at: column.integer,
	deleted_at: column.integer,
});

const memberships = new Table(
	{
		household_id: column.text,
		user_id: column.text,
		role: column.text,
		joined_at: column.integer,
		removed_at: column.integer,
	},
	{
		indexes: { by_user: ["user_id"] },
	},
);

const lists = new Table(
	{
		household_id: column.text,
		name: column.text,
		created_by_user_id: column.text,
		created_at: column.text,
		updated_at: column.text,
		archived_at: column.text,
		deleted_at: column.text,
	},
	{
		indexes: { by_household: ["household_id"] },
	},
);

const items = new Table(
	{
		list_id: column.text,
		name: column.text,
		quantity: column.text,
		notes: column.text,
		position: column.real,
		created_by_user_id: column.text,
		created_at: column.text,
		updated_at: column.text,
		deleted_at: column.text,
	},
	{
		indexes: { by_list: ["list_id"] },
	},
);

const item_checks = new Table(
	{
		item_id: column.text,
		checked_at: column.text,
		checked_by_user_id: column.text,
		updated_at: column.text,
	},
	{
		indexes: { by_item: ["item_id"] },
	},
);

export const AppSchema = new Schema({
	users,
	households,
	memberships,
	lists,
	items,
	item_checks,
});

export type Database = (typeof AppSchema)["types"];
