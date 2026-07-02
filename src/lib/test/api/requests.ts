export type ApiRequestInput = {
	method?: string;
	path?: string;
	body?: unknown;
	bearerToken?: string;
	headers?: HeadersInit;
};

export type JsonResponse = {
	status: number;
	body: unknown;
	headers: Headers;
};

const API_TEST_ORIGIN = "https://dont-forget.test";

export function createApiRequest(input: ApiRequestInput = {}): Request {
	const headers = new Headers(input.headers);
	const init: RequestInit = {
		method: input.method ?? (input.body === undefined ? "GET" : "POST"),
		headers,
	};

	if (input.bearerToken) {
		headers.set("authorization", `Bearer ${input.bearerToken}`);
	}

	if (input.body !== undefined) {
		headers.set("content-type", "application/json");
		init.body = JSON.stringify(input.body);
	}

	return new Request(new URL(input.path ?? "/api/test", API_TEST_ORIGIN), init);
}

export async function readJsonResponse(
	response: Response,
): Promise<JsonResponse> {
	return {
		status: response.status,
		body: await response.json(),
		headers: response.headers,
	};
}
