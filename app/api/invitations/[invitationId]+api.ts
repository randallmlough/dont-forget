export async function PATCH(
	request: Request,
	{ invitationId }: { invitationId: string },
): Promise<Response> {
	const { handleRevokeInvitation } = await import(
		"@/lib/api/invitations/handlers"
	);
	return handleRevokeInvitation(request, { invitationId });
}
