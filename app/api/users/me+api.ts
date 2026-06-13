export async function PATCH(request: Request): Promise<Response> {
	const { handleUpdateProfile } = await import("@/lib/api/users/handlers");
	return handleUpdateProfile(request);
}
