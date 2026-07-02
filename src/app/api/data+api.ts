export async function POST(request: Request): Promise<Response> {
	const { handleDataUpload } = await import("@/lib/api/data/handler");
	return handleDataUpload(request);
}
