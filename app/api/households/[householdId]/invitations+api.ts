export async function GET(
	request: Request,
	context: { params: { householdId: string } },
): Promise<Response> {
	const { handleListInvitations } = await import(
		"@/lib/api/invitations/handlers"
	);
	return handleListInvitations(request, {
		householdId: context.params.householdId,
	});
}
