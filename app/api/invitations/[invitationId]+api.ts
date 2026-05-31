export async function PATCH(
	request: Request,
	context: { params: { invitationId: string } },
): Promise<Response> {
	const { handleRevokeInvitation } = await import(
		"@/lib/api/invitations/handlers"
	);
	return handleRevokeInvitation(request, {
		invitationId: context.params.invitationId,
	});
}
