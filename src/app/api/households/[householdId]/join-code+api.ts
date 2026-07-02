export async function GET(
	request: Request,
	{ householdId }: { householdId: string },
): Promise<Response> {
	const { handleGetJoinCode } = await import("@/lib/api/households/handlers");
	return handleGetJoinCode(request, { householdId });
}

export async function PATCH(
	request: Request,
	{ householdId }: { householdId: string },
): Promise<Response> {
	const { handleSetJoinCodeEnabled } = await import(
		"@/lib/api/households/handlers"
	);
	return handleSetJoinCodeEnabled(request, { householdId });
}
