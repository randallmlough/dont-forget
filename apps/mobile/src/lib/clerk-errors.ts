import { isClerkAPIResponseError } from "@clerk/clerk-expo";

export function userMessage(error: unknown): string {
	if (isClerkAPIResponseError(error))
		return error.errors[0]?.message ?? "Something went wrong.";
	if (error instanceof Error) return error.message;
	return "Something went wrong.";
}
