export async function PATCH(request: Request): Promise<Response> {
	const { handleUpdateUserName } = await import("@/server/users/api");
	return handleUpdateUserName(request);
}
