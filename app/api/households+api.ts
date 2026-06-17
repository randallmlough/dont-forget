export async function POST(request: Request): Promise<Response> {
	const { handleCreateHousehold } = await import(
		"@/lib/api/households/handlers"
	);
	return handleCreateHousehold(request);
}
