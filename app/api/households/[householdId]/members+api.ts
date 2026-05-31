export async function GET(
	request: Request,
	{ householdId }: { householdId: string },
): Promise<Response> {
	const { handleListMembers } = await import("@/lib/api/households/handlers");
	return handleListMembers(request, { householdId });
}
