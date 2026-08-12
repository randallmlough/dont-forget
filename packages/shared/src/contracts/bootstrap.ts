import { z } from "zod";
import { memberRoleSchema } from "./members.ts";

export const BOOTSTRAP_API_PATH = "/api/bootstrap";

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
		firstName: z.string().nullable(),
		lastName: z.string().nullable(),
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
});

export type BootstrapResponse = z.infer<typeof bootstrapResponseSchema>;
