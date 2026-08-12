import { z } from "zod";

export const memberRoleSchema = z.enum(["owner", "member"]);

export const householdMemberSchema = z.object({
	membershipId: z.string(),
	userId: z.string(),
	role: memberRoleSchema,
	displayName: z.string().nullable(),
});

export type MemberRole = z.infer<typeof memberRoleSchema>;
export type HouseholdMember = z.infer<typeof householdMemberSchema>;
