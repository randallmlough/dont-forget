export async function GET(request: Request): Promise<Response> {
	const { handlePreviewInvitation } = await import(
		"@/lib/api/invitations/handlers"
	);
	return handlePreviewInvitation(request);
}
