export async function POST(request: Request): Promise<Response> {
	const { handleJoinByCode } = await import("@/server/households/api");
	return handleJoinByCode(request);
}
