export async function POST(request: Request): Promise<Response> {
	const { handleCreateInvitation } = await import("@/server/invitations/api");
	return handleCreateInvitation(request);
}
