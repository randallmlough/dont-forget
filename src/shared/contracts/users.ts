import { z } from "zod";

export const currentUserSchema = z.object({
	id: z.string(),
	email: z.string().nullable(),
	displayName: z.string().nullable(),
	firstName: z.string().nullable(),
	lastName: z.string().nullable(),
});

export const updateUserNameResponseSchema = z.object({
	user: currentUserSchema,
});

export type CurrentUser = z.infer<typeof currentUserSchema>;
export type UpdateUserNameResponse = z.infer<
	typeof updateUserNameResponseSchema
>;
