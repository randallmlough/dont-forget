export async function GET(
	request: Request,
	{ householdId }: { householdId: string },
): Promise<Response> {
	const { handleListInvitations } = await import(
		"@/server/invitations/api"
	);
	return handleListInvitations(request, { householdId });
}
