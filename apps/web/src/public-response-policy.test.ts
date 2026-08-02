import { headersForPublicWebRequest } from "./public-response-policy";

describe("headersForPublicWebRequest", () => {
	it("serves the AASA file as JSON", () => {
		expect(
			headersForPublicWebRequest("/.well-known/apple-app-site-association"),
		).toEqual({ "Content-Type": "application/json" });
	});

	it.each([
		"/invitations/accept",
		"/households/join",
	])("prevents caching and referrer forwarding for %s", (path) => {
		expect(headersForPublicWebRequest(path)).toEqual({
			"Cache-Control": "no-store",
			"Referrer-Policy": "no-referrer",
		});
	});

	it.each([
		{
			path: "/invitations/accept",
			query: "?token=synthetic-token",
		},
		{
			path: "/households/join",
			query: "?code=synthetic-code",
		},
	] as const)("ignores the query for $path", ({ path, query }) => {
		const headers = headersForPublicWebRequest(`${path}${query}`);

		expect(headers).toEqual(headersForPublicWebRequest(path));
		expect(Object.values(headers ?? {})).not.toContainEqual(
			expect.stringContaining(query),
		);
	});

	it("returns no policy for unrelated paths", () => {
		expect(headersForPublicWebRequest("/health")).toBeUndefined();
	});
});
