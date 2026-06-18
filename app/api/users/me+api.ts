export async function PATCH(request: Request): Promise<Response> {
	const { handleUpdateUserName } = await import("@/lib/api/users/handlers");
	return handleUpdateUserName(request);
}
