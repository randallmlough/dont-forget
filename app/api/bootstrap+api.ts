export async function POST(request: Request): Promise<Response> {
	const { handleBootstrap } = await import("@/lib/api/bootstrap/handlers");
	return handleBootstrap(request);
}
