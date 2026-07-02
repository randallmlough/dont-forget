export async function POST(request: Request): Promise<Response> {
	const { handleAcceptInvitation } = await import(
		"@/server/invitations/api"
	);
	return handleAcceptInvitation(request);
}
