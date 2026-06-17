export async function PATCH(
	request: Request,
	{ householdId }: { householdId: string },
): Promise<Response> {
	const { handleRenameHousehold } = await import(
		"@/lib/api/households/handlers"
	);
	return handleRenameHousehold(request, { householdId });
}

export async function DELETE(
	request: Request,
	{ householdId }: { householdId: string },
): Promise<Response> {
	const { handleDeleteHousehold } = await import(
		"@/lib/api/households/handlers"
	);
	return handleDeleteHousehold(request, { householdId });
}
