export async function POST(
	request: Request,
	{ householdId }: { householdId: string },
): Promise<Response> {
	const { handleLeaveHousehold } = await import(
		"@/server/households/api"
	);
	return handleLeaveHousehold(request, { householdId });
}
