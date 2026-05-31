export async function GET(
	request: Request,
	context: { params: { householdId: string } },
): Promise<Response> {
	const { handleListMembers } = await import("@/lib/api/households/handlers");
	return handleListMembers(request, {
		householdId: context.params.householdId,
	});
}
