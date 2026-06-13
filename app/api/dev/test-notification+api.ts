export async function POST(request: Request): Promise<Response> {
	const { handleSendTestNotification } = await import(
		"@/lib/api/users/handlers"
	);
	return handleSendTestNotification(request);
}
