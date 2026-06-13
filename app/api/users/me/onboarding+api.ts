export async function POST(request: Request): Promise<Response> {
	const { handleCompleteOnboarding } = await import("@/lib/api/users/handlers");

	return handleCompleteOnboarding(request);
}
