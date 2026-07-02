export async function PATCH(request: Request): Promise<Response> {
	const { handleSwitchActiveHousehold } = await import(
		"@/server/households/api"
	);
	return handleSwitchActiveHousehold(request);
}
