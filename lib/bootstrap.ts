import { z } from "zod";

export const BOOTSTRAP_API_PATH = "/api/bootstrap";
export const DEFAULT_LIST_ID = "lst_default_groceries";
export const DEFAULT_LIST_NAME = "Groceries";
export const HOUSEHOLD_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const memberRoleSchema = z.enum(["owner", "member"]);

const associatedHouseholdSchema = z.object({
	id: z.string(),
	name: z.string(),
	role: memberRoleSchema,
	isActive: z.boolean(),
});

export const bootstrapResponseSchema = z.object({
	user: z.object({
		id: z.string(),
		email: z.string().nullable(),
		displayName: z.string().nullable(),
		onboardingCompletedAt: z.number().nullable(),
	}),
	activeHousehold: z.object({
		id: z.string(),
		name: z.string(),
	}),
	households: z.array(associatedHouseholdSchema),
	activeMember: z.object({
		id: z.string(),
		userId: z.string(),
		role: memberRoleSchema,
		displayName: z.string().nullable(),
	}),
	members: z.array(
		z.object({
			membershipId: z.string(),
			userId: z.string(),
			role: memberRoleSchema,
			displayName: z.string().nullable(),
		}),
	),
	householdDatabase: z.object({
		url: z.string(),
		authToken: z.string(),
		expiresAt: z.number(),
	}),
});

export type BootstrapResponse = z.infer<typeof bootstrapResponseSchema>;
