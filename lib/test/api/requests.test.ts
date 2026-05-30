import { createApiRequest, readJsonResponse } from "./requests";

describe("API test requests", () => {
	it("builds authenticated JSON requests for API handlers", async () => {
		const request = createApiRequest({
			method: "POST",
			path: "/api/invitations",
			bearerToken: "session-token",
			body: { householdId: "hh_avery" },
		});

		expect(request.method).toBe("POST");
		expect(request.url).toBe("https://dont-forget.test/api/invitations");
		expect(request.headers.get("authorization")).toBe("Bearer session-token");
		expect(request.headers.get("content-type")).toBe("application/json");
		expect(await request.json()).toEqual({ householdId: "hh_avery" });
	});

	it("defaults requests with a JSON body to POST", async () => {
		const request = createApiRequest({
			body: { code: "ABCDEFGH" },
		});

		expect(request.method).toBe("POST");
		expect(await request.json()).toEqual({ code: "ABCDEFGH" });
	});

	it("reads JSON responses with status and headers", async () => {
		const response = Response.json(
			{ ok: true },
			{ status: 201, headers: { "x-test": "created" } },
		);

		await expect(readJsonResponse(response)).resolves.toEqual({
			status: 201,
			body: { ok: true },
			headers: expect.any(Headers),
		});
		expect(response.headers.get("x-test")).toBe("created");
	});
});
