import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  name: text("name"),
  tursoDbName: text("turso_db_name").notNull().unique(),
  createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  deletedAt: integer("deleted_at"),
});

export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id),
    clerkUserId: text("clerk_user_id").notNull(),
    role: text("role", { enum: ["owner", "member"] }).notNull(),
    joinedAt: integer("joined_at").notNull().default(sql`(unixepoch() * 1000)`),
    removedAt: integer("removed_at"),
    tursoTokenId: text("turso_token_id"),
  },
  (t) => [
    index("memberships_user_idx").on(t.clerkUserId),
    index("memberships_household_idx").on(t.householdId),
    uniqueIndex("memberships_active_unique")
      .on(t.householdId, t.clerkUserId)
      .where(sql`${t.removedAt} IS NULL`),
  ],
);

export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id),
    token: text("token").notNull().unique(),
    email: text("email"),
    createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    expiresAt: integer("expires_at").notNull(),
    acceptedAt: integer("accepted_at"),
    acceptedByClerkUserId: text("accepted_by_clerk_user_id"),
    revokedAt: integer("revoked_at"),
  },
  (t) => [index("invitations_household_idx").on(t.householdId)],
);

export type Household = typeof households.$inferSelect;
export type NewHousehold = typeof households.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
