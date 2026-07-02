export async function GET(
	request: Request,
	{ householdId }: { householdId: string },
): Promise<Response> {
	const { handleGetJoinCode } = await import("@/server/households/api");
	return handleGetJoinCode(request, { householdId });
}

export async function PATCH(
	request: Request,
	{ householdId }: { householdId: string },
): Promise<Response> {
	const { handleSetJoinCodeEnabled } = await import(
		"@/server/households/api"
	);
	return handleSetJoinCodeEnabled(request, { householdId });
}
