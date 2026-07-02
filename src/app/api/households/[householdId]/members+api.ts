export async function GET(
	request: Request,
	{ householdId }: { householdId: string },
): Promise<Response> {
	const { handleListMembers } = await import("@/server/households/api");
	return handleListMembers(request, { householdId });
}
