import Constants from "expo-constants";

import {
	BOOTSTRAP_API_PATH,
	type BootstrapResponse,
	bootstrapResponseSchema,
} from "@/lib/bootstrap";

type GetToken = () => Promise<string | null>;

export async function bootstrapWithClerk(
	getToken: GetToken,
): Promise<BootstrapResponse> {
	const token = await getToken();
	if (!token) {
		throw new Error("Missing Clerk session token");
	}

	const response = await fetch(`${apiBaseUrl()}${BOOTSTRAP_API_PATH}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});

	if (!response.ok) {
		throw new Error("Unable to prepare your Household. Please try again.");
	}

	const payload: unknown = await response.json();
	return bootstrapResponseSchema.parse(payload);
}

function apiBaseUrl(): string {
	const value = Constants.expoConfig?.extra?.apiBaseUrl;
	if (typeof value !== "string" || value.length === 0) {
		throw new Error("Missing EXPO_PUBLIC_API_BASE_URL");
	}

	return value.replace(/\/$/, "");
}
