import { z } from "zod";

import { readApiBaseUrl } from "@/lib/client-api/api-base-url";

export type ApiGetToken = () => Promise<string | null>;

export type UsersApiClient = {
	completeOnboarding(): Promise<void>;
	registerPushToken(input: {
		expoPushToken: string;
		deviceName?: string | null;
	}): Promise<void>;
	unregisterPushToken(input: { expoPushToken: string }): Promise<void>;
	sendTestNotification(): Promise<{ sent: number; disabled: number }>;
};

const testNotificationResponseSchema = z.object({
	sent: z.number(),
	disabled: z.number(),
});

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
		async completeOnboarding() {
			await authed("/api/users/me/onboarding", {
				method: "POST",
			});
		},
		async registerPushToken(input) {
			await authed("/api/users/me/push-tokens", {
				method: "POST",
				body: JSON.stringify(input),
			});
		},
		async unregisterPushToken(input) {
			await authed("/api/users/me/push-tokens", {
				method: "DELETE",
				body: JSON.stringify(input),
			});
		},
		async sendTestNotification() {
			const payload = await authed("/api/dev/test-notification", {
				method: "POST",
			});
			return testNotificationResponseSchema.parse(payload);
		},
	};
}

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
		const parsed = z.object({ error: z.string() }).safeParse(payload);
		throw new Error(
			parsed.success ? parsed.data.error : "Something went wrong.",
		);
	}
	return payload;
}
