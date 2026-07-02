export async function POST(request: Request): Promise<Response> {
	const { handleAcceptInvitation } = await import(
		"@/lib/api/invitations/handlers"
	);
	return handleAcceptInvitation(request);
}
