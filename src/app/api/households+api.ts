export async function POST(request: Request): Promise<Response> {
	const { handleCreateHousehold } = await import("@/server/households/api");
	return handleCreateHousehold(request);
}
