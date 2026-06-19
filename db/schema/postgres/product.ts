import {
	doublePrecision,
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { households } from "./directory";

export const lists = pgTable(
	"lists",
	{
		id: text("id").primaryKey(),
		// NET-NEW vs libsql: lists carry household_id directly so the sync
		// streams can scope them (each Household is no longer its own DB).
		householdId: text("household_id")
			.notNull()
			.references(() => households.id),
		name: text("name").notNull(),
		createdByUserId: text("created_by_user_id").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [index("lists_by_household_idx").on(t.householdId)],
);

export const items = pgTable(
	"items",
	{
		id: text("id").primaryKey(),
		listId: text("list_id")
			.notNull()
			.references(() => lists.id),
		name: text("name").notNull(),
		// quantity is text and position is a real/double — mirroring the
		// authoritative libsql data model (db/schema/household.ts), not the
		// spike's integer choice.
		quantity: text("quantity"),
		notes: text("notes"),
		position: doublePrecision("position").notNull(),
		createdByUserId: text("created_by_user_id").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		index("items_list_idx").on(t.listId),
		index("items_deleted_idx").on(t.deletedAt),
	],
);

// Decision 9: a single shared check per Item (NOT the libsql per-user shape).
// Keyed by a synthetic `id` (the PowerSync PATCH/DELETE key) with a unique
// item_id enforcing one row per Item. checked_at NULL == unchecked.
export const itemChecks = pgTable("item_checks", {
	id: text("id").primaryKey(),
	itemId: text("item_id")
		.notNull()
		.unique()
		.references(() => items.id),
	checkedAt: timestamp("checked_at", { withTimezone: true }),
	checkedByUserId: text("checked_by_user_id"),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type List = typeof lists.$inferSelect;
export type NewList = typeof lists.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type ItemCheck = typeof itemChecks.$inferSelect;
export type NewItemCheck = typeof itemChecks.$inferInsert;
