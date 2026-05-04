import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, index, primaryKey } from "drizzle-orm/sqlite-core";

export const lists = sqliteTable(
  "lists",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
    deletedAt: integer("deleted_at"),
  },
  (t) => [index("lists_deleted_idx").on(t.deletedAt)],
);

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => lists.id),
    name: text("name").notNull(),
    notes: text("notes"),
    position: real("position").notNull(),
    createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
    deletedAt: integer("deleted_at"),
  },
  (t) => [
    index("items_list_idx").on(t.listId),
    index("items_deleted_idx").on(t.deletedAt),
  ],
);

// Split out from `items` so the highest-collision field can't conflict under LWW (ADR-0002).
export const itemChecks = sqliteTable(
  "item_checks",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => items.id),
    clerkUserId: text("clerk_user_id").notNull(),
    checkedAt: integer("checked_at"),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.clerkUserId] })],
);

export type List = typeof lists.$inferSelect;
export type NewList = typeof lists.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type ItemCheck = typeof itemChecks.$inferSelect;
export type NewItemCheck = typeof itemChecks.$inferInsert;
