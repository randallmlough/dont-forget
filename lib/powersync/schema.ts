import { column, Schema, Table } from "@powersync/react-native";

// PowerSync streams timestamps as ISO text; keep these column.text values aligned with PR-A's sync-stream representation.
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
	created_at: column.text,
	deleted_at: column.text,
});

const memberships = new Table(
	{
		household_id: column.text,
		user_id: column.text,
		role: column.text,
		joined_at: column.text,
		removed_at: column.text,
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
