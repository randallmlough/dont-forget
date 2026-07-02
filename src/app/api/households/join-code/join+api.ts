export async function POST(request: Request): Promise<Response> {
	const { handleJoinByCode } = await import("@/lib/api/households/handlers");
	return handleJoinByCode(request);
}
