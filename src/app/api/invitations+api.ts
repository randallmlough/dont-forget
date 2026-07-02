export async function POST(request: Request): Promise<Response> {
	const { handleCreateInvitation } = await import(
		"@/lib/api/invitations/handlers"
	);
	return handleCreateInvitation(request);
}
