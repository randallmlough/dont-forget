export async function GET(request: Request): Promise<Response> {
	const { handlePreviewJoinCode } = await import("@/server/households/api");
	return handlePreviewJoinCode(request);
}
