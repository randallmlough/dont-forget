export async function POST(
	request: Request,
	{ householdId }: { householdId: string },
): Promise<Response> {
	const { handleRegenerateJoinCode } = await import(
		"@/lib/api/households/handlers"
	);
	return handleRegenerateJoinCode(request, { householdId });
}
