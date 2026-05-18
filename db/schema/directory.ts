import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
	"users",
	{
		id: text("id").primaryKey(),
		clerkUserId: text("clerk_user_id").notNull(),
		email: text("email"),
		firstName: text("first_name"),
		lastName: text("last_name"),
		displayName: text("display_name"),
		createdAt: integer("created_at")
			.notNull()
			.default(sql`(unixepoch() * 1000)`),
		updatedAt: integer("updated_at")
			.notNull()
			.default(sql`(unixepoch() * 1000)`),
	},
	(t) => [uniqueIndex("users_clerk_user_id_unique").on(t.clerkUserId)],
);

export const households = sqliteTable("households", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	tursoDbName: text("turso_db_name").notNull().unique(),
	createdByUserId: text("created_by_user_id")
		.notNull()
		.references(() => users.id),
	provisioningCompletedAt: integer("provisioning_completed_at"),
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
		userId: text("user_id")
			.notNull()
			.references(() => users.id),
		role: text("role", { enum: ["owner", "member"] }).notNull(),
		joinedAt: integer("joined_at").notNull().default(sql`(unixepoch() * 1000)`),
		removedAt: integer("removed_at"),
	},
	(t) => [
		index("memberships_user_idx").on(t.userId),
		index("memberships_household_idx").on(t.householdId),
		uniqueIndex("memberships_active_unique")
			.on(t.householdId, t.userId)
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
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: integer("created_at")
			.notNull()
			.default(sql`(unixepoch() * 1000)`),
		expiresAt: integer("expires_at").notNull(),
		acceptedAt: integer("accepted_at"),
		acceptedByUserId: text("accepted_by_user_id").references(() => users.id),
		revokedAt: integer("revoked_at"),
	},
	(t) => [index("invitations_household_idx").on(t.householdId)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Household = typeof households.$inferSelect;
export type NewHousehold = typeof households.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
