export async function POST(request: Request): Promise<Response> {
	const { handleBootstrap } = await import("@/server/bootstrap/api");
	return handleBootstrap(request);
}
