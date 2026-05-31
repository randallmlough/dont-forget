export async function GET(
	request: Request,
	context: { params: { householdId: string } },
): Promise<Response> {
	const { handleGetJoinCode } = await import("@/lib/api/households/handlers");
	return handleGetJoinCode(request, {
		householdId: context.params.householdId,
	});
}

export async function PATCH(
	request: Request,
	context: { params: { householdId: string } },
): Promise<Response> {
	const { handleSetJoinCodeEnabled } = await import(
		"@/lib/api/households/handlers"
	);
	return handleSetJoinCodeEnabled(request, {
		householdId: context.params.householdId,
	});
}
