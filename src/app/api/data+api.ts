export async function POST(request: Request): Promise<Response> {
	const { handleDataUpload } = await import("@/server/data/api");
	return handleDataUpload(request);
}
