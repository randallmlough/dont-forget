export async function GET(request: Request): Promise<Response> {
	const { handlePreviewJoinCode } = await import(
		"@/lib/api/households/handlers"
	);
	return handlePreviewJoinCode(request);
}
