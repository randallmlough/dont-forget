import { BOOTSTRAP_API_PATH } from "@/lib/bootstrap";
import { createMockAnalytics } from "@/lib/test/mocks/analytics";
import { createSessionBootstrapService } from "./bootstrap";
import { sessionBootstrapFixture } from "./bootstrap.test-helpers";

jest.mock("@/lib/analytics", () =>
	jest.requireActual("@/lib/test/mocks/analytics"),
);

describe("createSessionBootstrapService", () => {
	it("loads a fresh online Authenticated App Session with a Clerk session token", async () => {
		const session = sessionBootstrapFixture();
		const analytics = createMockAnalytics();
		const fetcher = jest.fn(async (_input: unknown, _init?: unknown) =>
			responseFixture(session),
		);
		const fetchForService: typeof globalThis.fetch = (input, init) =>
			fetcher(input, init);
		const service = createSessionBootstrapService({
			fetch: fetchForService,
			apiBaseUrl: () => "https://api.example.test/",
			analytics,
		});

		await expect(
			service.getSession(async () => "session-token"),
		).resolves.toEqual(session);
		expect(fetcher).toHaveBeenCalledWith(
			`https://api.example.test${BOOTSTRAP_API_PATH}`,
			{
				method: "POST",
				headers: {
					Authorization: "Bearer session-token",
				},
			},
		);
		expect(analytics.track).toHaveBeenCalledWith(
			"authenticated_app_session_loaded",
			{
				household_id: "hh_avery",
				member_role: "owner",
				member_count: 1,
				source: "online",
			},
		);
	});
});

function responseFixture(payload: unknown): Response {
	const response: Pick<Response, "json" | "ok"> = {
		ok: true,
		json: async () => payload,
	};
	return response as Response;
}
