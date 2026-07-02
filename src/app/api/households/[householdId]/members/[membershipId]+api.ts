export async function DELETE(
	request: Request,
	{ householdId, membershipId }: { householdId: string; membershipId: string },
): Promise<Response> {
	const { handleRemoveMember } = await import("@/server/households/api");
	return handleRemoveMember(request, { householdId, membershipId });
}

export async function PATCH(
	request: Request,
	{ householdId, membershipId }: { householdId: string; membershipId: string },
): Promise<Response> {
	const { handleChangeMemberRole } = await import(
		"@/server/households/api"
	);
	return handleChangeMemberRole(request, { householdId, membershipId });
}
