import { z } from "zod";

export const pendingInvitationSchema = z.object({
	id: z.string(),
	householdId: z.string(),
	email: z.string().nullable(),
	createdByUserId: z.string(),
	creatorDisplayName: z.string().nullable(),
	createdAt: z.number(),
	expiresAt: z.number(),
	acceptUrl: z.string(),
});

export const invitationRecordSchema = z.object({
	id: z.string(),
	householdId: z.string(),
	email: z.string().nullable(),
	createdByUserId: z.string(),
	createdAt: z.number(),
	expiresAt: z.number(),
	acceptedAt: z.number().nullable(),
	acceptedByUserId: z.string().nullable(),
	revokedAt: z.number().nullable(),
	acceptUrl: z.string(),
});

export const emailDeliverySchema = z.discriminatedUnion("status", [
	z.object({ status: z.literal("not_requested") }),
	z.object({ status: z.literal("sent") }),
	z.object({ status: z.literal("skipped"), reason: z.literal("environment") }),
	z.object({ status: z.literal("failed"), message: z.string() }),
]);

export const invitationPreviewSchema = z.discriminatedUnion("available", [
	z.object({
		available: z.literal(true),
		householdName: z.string(),
		inviterDisplayName: z.string(),
	}),
	z.object({ available: z.literal(false) }),
]);

export const createInvitationResponseSchema = z.object({
	invitation: invitationRecordSchema,
	emailDelivery: emailDeliverySchema,
	reusedExisting: z.boolean(),
});

export const listInvitationsResponseSchema = z.object({
	invitations: z.array(pendingInvitationSchema),
});

export const revokeInvitationResponseSchema = z.object({
	invitation: invitationRecordSchema,
});

export type PendingInvitation = z.infer<typeof pendingInvitationSchema>;
export type InvitationRecord = z.infer<typeof invitationRecordSchema>;
export type CreateInvitationResponse = z.infer<
	typeof createInvitationResponseSchema
>;
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;
