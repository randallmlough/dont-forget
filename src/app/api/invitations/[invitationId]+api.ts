export async function PATCH(
	request: Request,
	{ invitationId }: { invitationId: string },
): Promise<Response> {
	const { handleRevokeInvitation } = await import("@/server/invitations/api");
	return handleRevokeInvitation(request, { invitationId });
}
