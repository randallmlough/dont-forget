import { z } from "zod";

import { readApiBaseUrl } from "@/lib/client-api/api-base-url";

export type ApiGetToken = () => Promise<string | null>;

export const currentUserSchema = z.object({
	id: z.string(),
	email: z.string().nullable(),
	displayName: z.string().nullable(),
	firstName: z.string().nullable(),
	lastName: z.string().nullable(),
});

const updateUserNameResponseSchema = z.object({
	user: currentUserSchema,
});

export type CurrentUser = z.infer<typeof currentUserSchema>;

export type UsersApiClient = {
	updateUserName(input: {
		firstName: string | null;
		lastName: string | null;
	}): Promise<CurrentUser>;
};

export type UserApiClient = UsersApiClient;

export function createUsersApiClient({
	getToken,
	fetcher = globalThis.fetch,
	apiBaseUrl = readApiBaseUrl,
}: {
	getToken: ApiGetToken;
	fetcher?: typeof globalThis.fetch;
	apiBaseUrl?: () => string;
}): UsersApiClient {
	const authed = (path: string, init?: RequestInit) =>
		requestJson(path, { ...init, getToken, fetcher, apiBaseUrl });

	return {
		async updateUserName(input) {
			const payload = await authed("/api/users/me", {
				method: "PATCH",
				body: JSON.stringify(input),
			});
			return updateUserNameResponseSchema.parse(payload).user;
		},
	};
}

export const createUserApiClient = createUsersApiClient;

async function requestJson(
	path: string,
	options: RequestInit & {
		getToken: ApiGetToken;
		fetcher: typeof globalThis.fetch;
		apiBaseUrl: () => string;
	},
): Promise<unknown> {
	const { getToken, fetcher, apiBaseUrl, ...requestInit } = options;
	const token = await getToken();
	if (!token) throw new Error("Sign in to continue.");

	const headers = new Headers(requestInit.headers);
	headers.set("Accept", "application/json");
	headers.set("Authorization", `Bearer ${token}`);
	if (requestInit.body) headers.set("Content-Type", "application/json");

	const response = await fetcher(`${apiBaseUrl()}${path}`, {
		...requestInit,
		headers,
	});
	const payload: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		throw new Error(errorMessageFromPayload(payload));
	}
	return payload;
}

function errorMessageFromPayload(payload: unknown): string {
	const parsed = z.object({ error: z.string() }).safeParse(payload);
	return parsed.success ? parsed.data.error : "Something went wrong.";
}
