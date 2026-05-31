export async function PATCH(request: Request): Promise<Response> {
	const { handleSwitchActiveHousehold } = await import(
		"@/lib/api/households/handlers"
	);
	return handleSwitchActiveHousehold(request);
}
