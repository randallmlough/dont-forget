export async function POST(
	request: Request,
	{ householdId }: { householdId: string },
): Promise<Response> {
	const { handleLeaveHousehold } = await import(
		"@/lib/api/households/handlers"
	);
	return handleLeaveHousehold(request, { householdId });
}
