export async function POST(
	request: Request,
	context: { params: { householdId: string } },
): Promise<Response> {
	const { handleRegenerateJoinCode } = await import(
		"@/lib/api/households/handlers"
	);
	return handleRegenerateJoinCode(request, {
		householdId: context.params.householdId,
	});
}
