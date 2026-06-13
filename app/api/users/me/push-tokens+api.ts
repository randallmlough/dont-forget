export async function POST(request: Request): Promise<Response> {
	const { handleRegisterPushToken } = await import("@/lib/api/users/handlers");
	return handleRegisterPushToken(request);
}

export async function DELETE(request: Request): Promise<Response> {
	const { handleUnregisterPushToken } = await import(
		"@/lib/api/users/handlers"
	);
	return handleUnregisterPushToken(request);
}
