import { z } from "zod";
import { householdMemberSchema } from "./members";

export const joinCodeSchema = z.discriminatedUnion("enabled", [
	z.object({
		enabled: z.literal(true),
		id: z.string(),
		householdId: z.string(),
		code: z.string(),
		joinUrl: z.string(),
		createdAt: z.number(),
	}),
	z.object({
		enabled: z.literal(false),
		householdId: z.string(),
	}),
]);

export const joinCodePreviewSchema = z.discriminatedUnion("available", [
	z.object({ available: z.literal(true), householdName: z.string() }),
	z.object({ available: z.literal(false) }),
]);

export const renameHouseholdResponseSchema = z.object({
	household: z.object({
		id: z.string(),
		name: z.string(),
	}),
});

export const createHouseholdResponseSchema = z.object({
	household: z.object({
		id: z.string(),
		name: z.string(),
	}),
});

export const leaveHouseholdResponseSchema = z.object({
	left: z.literal(true),
	promotedMembershipId: z.string().nullable(),
});

export const listMembersResponseSchema = z.object({
	members: z.array(householdMemberSchema),
});

export const joinCodeResponseSchema = z.object({
	joinCode: joinCodeSchema,
});

export type HouseholdJoinCode = z.infer<typeof joinCodeSchema>;
export type HouseholdJoinCodePreview = z.infer<typeof joinCodePreviewSchema>;
export type LeaveHouseholdResponse = z.infer<
	typeof leaveHouseholdResponseSchema
>;
export type CreateHouseholdResponse = z.infer<
	typeof createHouseholdResponseSchema
>;
export type RenameHouseholdResponse = z.infer<
	typeof renameHouseholdResponseSchema
>;
export type ListMembersResponse = z.infer<typeof listMembersResponseSchema>;
export type JoinCodeResponse = z.infer<typeof joinCodeResponseSchema>;
