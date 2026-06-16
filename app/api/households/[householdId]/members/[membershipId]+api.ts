export async function DELETE(
	request: Request,
	{ householdId, membershipId }: { householdId: string; membershipId: string },
): Promise<Response> {
	const { handleRemoveMember } = await import("@/lib/api/households/handlers");
	return handleRemoveMember(request, { householdId, membershipId });
}

export async function PATCH(
	request: Request,
	{ householdId, membershipId }: { householdId: string; membershipId: string },
): Promise<Response> {
	const { handleChangeMemberRole } = await import(
		"@/lib/api/households/handlers"
	);
	return handleChangeMemberRole(request, { householdId, membershipId });
}
