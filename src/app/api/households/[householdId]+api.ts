export async function PATCH(
	request: Request,
	{ householdId }: { householdId: string },
): Promise<Response> {
	const { handleRenameHousehold } = await import(
		"@/server/households/api"
	);
	return handleRenameHousehold(request, { householdId });
}
