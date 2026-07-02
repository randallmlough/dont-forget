export async function GET(request: Request): Promise<Response> {
	const { handlePreviewInvitation } = await import(
		"@/server/invitations/api"
	);
	return handlePreviewInvitation(request);
}
