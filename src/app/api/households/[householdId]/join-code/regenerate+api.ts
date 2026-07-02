export async function POST(
	request: Request,
	{ householdId }: { householdId: string },
): Promise<Response> {
	const { handleRegenerateJoinCode } = await import("@/server/households/api");
	return handleRegenerateJoinCode(request, { householdId });
}
