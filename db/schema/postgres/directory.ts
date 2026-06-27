import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	bigint,
	index,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";

const nowEpochMillis = sql`(extract(epoch from now()) * 1000)::bigint`;

export const users = pgTable(
	"users",
	{
		id: text("id").primaryKey(),
		clerkUserId: text("clerk_user_id").notNull(),
		email: text("email"),
		firstName: text("first_name"),
		lastName: text("last_name"),
		displayName: text("display_name"),
		activeHouseholdId: text("active_household_id").references(
			(): AnyPgColumn => households.id,
		),
		createdAt: bigint("created_at", { mode: "number" })
			.notNull()
			.default(nowEpochMillis),
		updatedAt: bigint("updated_at", { mode: "number" })
			.notNull()
			.default(nowEpochMillis),
	},
	(t) => [uniqueIndex("users_clerk_user_id_unique").on(t.clerkUserId)],
);

export const households = pgTable("households", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	tursoDbName: text("turso_db_name").notNull().unique(),
	createdByUserId: text("created_by_user_id")
		.notNull()
		.references((): AnyPgColumn => users.id),
	provisioningCompletedAt: bigint("provisioning_completed_at", {
		mode: "number",
	}),
	createdAt: bigint("created_at", { mode: "number" })
		.notNull()
		.default(nowEpochMillis),
	deletedAt: bigint("deleted_at", { mode: "number" }),
});

export const memberships = pgTable(
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
		joinedAt: bigint("joined_at", { mode: "number" })
			.notNull()
			.default(nowEpochMillis),
		removedAt: bigint("removed_at", { mode: "number" }),
	},
	(t) => [
		index("memberships_user_idx").on(t.userId),
		index("memberships_household_idx").on(t.householdId),
		uniqueIndex("memberships_active_unique")
			.on(t.householdId, t.userId)
			.where(sql`${t.removedAt} IS NULL`),
	],
);

export const invitations = pgTable(
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
		createdAt: bigint("created_at", { mode: "number" })
			.notNull()
			.default(nowEpochMillis),
		expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
		acceptedAt: bigint("accepted_at", { mode: "number" }),
		acceptedByUserId: text("accepted_by_user_id").references(() => users.id),
		revokedAt: bigint("revoked_at", { mode: "number" }),
	},
	(t) => [index("invitations_household_idx").on(t.householdId)],
);

export const householdJoinCodes = pgTable(
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
		createdAt: bigint("created_at", { mode: "number" })
			.notNull()
			.default(nowEpochMillis),
		disabledAt: bigint("disabled_at", { mode: "number" }),
		disabledByUserId: text("disabled_by_user_id").references(() => users.id),
		replacedAt: bigint("replaced_at", { mode: "number" }),
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

export const householdJoinCodeUses = pgTable(
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
		usedAt: bigint("used_at", { mode: "number" })
			.notNull()
			.default(nowEpochMillis),
	},
	(t) => [
		index("household_join_code_uses_code_idx").on(t.householdJoinCodeId),
		index("household_join_code_uses_household_idx").on(t.householdId),
		index("household_join_code_uses_user_idx").on(t.userId),
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
