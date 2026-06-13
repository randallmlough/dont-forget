export async function PATCH(request: Request): Promise<Response> {
	const { handleUpdateUserName } = await import("@/lib/api/users/handlers");
	return handleUpdateUserName(request);
}

export async function DELETE(request: Request): Promise<Response> {
	const { handleDeleteAccount } = await import("@/lib/api/users/handlers");
	return handleDeleteAccount(request);
}
