export async function GET(
	request: Request,
	{ householdId }: { householdId: string },
): Promise<Response> {
	const { handleListInvitations } = await import(
		"@/lib/api/invitations/handlers"
	);
	return handleListInvitations(request, { householdId });
}
