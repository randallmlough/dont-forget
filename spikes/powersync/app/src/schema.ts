// PowerSync client schema: local SQLite tables are VIEWS over synced data.
// Mirrors the synced Postgres tables. `id` is implicit (text) and must NOT be
// declared. Column types map app fields; timestamps are stored as text.
import { column, Schema, Table } from '@powersync/react-native';

const users = new Table({
  clerk_user_id: column.text,
  display_name: column.text,
});

const households = new Table({
  name: column.text,
});

const memberships = new Table(
  {
    household_id: column.text,
    user_id: column.text,
    role: column.text,
    status: column.text,
  },
  { indexes: { by_user: ['user_id'] } },
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
  { indexes: { by_household: ['household_id'] } },
);

const items = new Table(
  {
    list_id: column.text,
    name: column.text,
    quantity: column.integer,
    notes: column.text,
    position: column.integer,
    created_by_user_id: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
  },
  { indexes: { by_list: ['list_id'] } },
);

// item_checks has a composite PK in Postgres (item_id, user_id). PowerSync
// tables always have a synthetic `id`; we carry item_id/user_id as columns and
// the upload endpoint upserts on (item_id, user_id).
const item_checks = new Table(
  {
    item_id: column.text,
    user_id: column.text,
    checked_at: column.text,
    updated_at: column.text,
  },
  { indexes: { by_item: ['item_id'] } },
);

export const AppSchema = new Schema({
  users,
  households,
  memberships,
  lists,
  items,
  item_checks,
});

export type Database = (typeof AppSchema)['types'];
