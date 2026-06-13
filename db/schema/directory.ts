import { sql } from "drizzle-orm";
import {
	type AnySQLiteColumn,
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
		activeHouseholdId: text("active_household_id").references(
			(): AnySQLiteColumn => households.id,
		),
		onboardingCompletedAt: integer("onboarding_completed_at"),
		createdAt: integer("created_at")
			.notNull()
			.default(sql`(unixepoch() * 1000)`),
		updatedAt: integer("updated_at")
			.notNull()
			.default(sql`(unixepoch() * 1000)`),
		deletedAt: integer("deleted_at"),
	},
	(t) => [uniqueIndex("users_clerk_user_id_unique").on(t.clerkUserId)],
);

export const households = sqliteTable("households", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	tursoDbName: text("turso_db_name").notNull().unique(),
	createdByUserId: text("created_by_user_id")
		.notNull()
		.references((): AnySQLiteColumn => users.id),
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

export const householdJoinCodes = sqliteTable(
	"household_join_codes",
	{
		id: text("id").primaryKey(),
		householdId: text("household_id")
			.notNull()
			.references(() => households.id),
		code: text("code").notNull(),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: integer("created_at")
			.notNull()
			.default(sql`(unixepoch() * 1000)`),
		disabledAt: integer("disabled_at"),
		disabledByUserId: text("disabled_by_user_id").references(() => users.id),
		replacedAt: integer("replaced_at"),
		replacedByUserId: text("replaced_by_user_id").references(() => users.id),
	},
	(t) => [
		index("household_join_codes_household_idx").on(t.householdId),
		uniqueIndex("household_join_codes_code_unique").on(t.code),
		uniqueIndex("household_join_codes_active_household_unique")
			.on(t.householdId)
			.where(sql`${t.disabledAt} IS NULL AND ${t.replacedAt} IS NULL`),
	],
);

export const householdJoinCodeUses = sqliteTable(
	"household_join_code_uses",
	{
		id: text("id").primaryKey(),
		householdJoinCodeId: text("household_join_code_id")
			.notNull()
			.references(() => householdJoinCodes.id),
		householdId: text("household_id")
			.notNull()
			.references(() => households.id),
		userId: text("user_id")
			.notNull()
			.references(() => users.id),
		membershipId: text("membership_id")
			.notNull()
			.references(() => memberships.id),
		usedAt: integer("used_at").notNull().default(sql`(unixepoch() * 1000)`),
	},
	(t) => [
		index("household_join_code_uses_code_idx").on(t.householdJoinCodeId),
		index("household_join_code_uses_household_idx").on(t.householdId),
		index("household_join_code_uses_user_idx").on(t.userId),
	],
);

export const householdJoinCodeAttempts = sqliteTable(
	"household_join_code_attempts",
	{
		userId: text("user_id")
			.primaryKey()
			.references(() => users.id),
		failedCount: integer("failed_count").notNull(),
		windowStartedAt: integer("window_started_at").notNull(),
		lastFailedAt: integer("last_failed_at").notNull(),
	},
);

export const pushTokens = sqliteTable(
	"push_tokens",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id),
		expoPushToken: text("expo_push_token").notNull(),
		deviceName: text("device_name"),
		platform: text("platform", { enum: ["ios"] }).notNull(),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
		disabledAt: integer("disabled_at"),
	},
	(t) => [
		index("push_tokens_user_idx").on(t.userId),
		uniqueIndex("push_tokens_token_unique").on(t.expoPushToken),
	],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Household = typeof households.$inferSelect;
export type NewHousehold = typeof households.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type HouseholdJoinCode = typeof householdJoinCodes.$inferSelect;
export type NewHouseholdJoinCode = typeof householdJoinCodes.$inferInsert;
export type HouseholdJoinCodeUse = typeof householdJoinCodeUses.$inferSelect;
export type NewHouseholdJoinCodeUse = typeof householdJoinCodeUses.$inferInsert;
export type HouseholdJoinCodeAttempt =
	typeof householdJoinCodeAttempts.$inferSelect;
export type NewHouseholdJoinCodeAttempt =
	typeof householdJoinCodeAttempts.$inferInsert;
export type PushToken = typeof pushTokens.$inferSelect;
export type NewPushToken = typeof pushTokens.$inferInsert;
