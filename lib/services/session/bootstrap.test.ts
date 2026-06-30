import { BOOTSTRAP_API_PATH, type BootstrapResponse } from "@/lib/bootstrap";
import { createMockAnalytics } from "@/lib/test/mocks/analytics";
import { createSessionBootstrapService } from "./bootstrap";

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

	it("throws when there is no Clerk session token", async () => {
		const fetcher = jest.fn();
		const service = createSessionBootstrapService({
			fetch: fetcher as unknown as typeof globalThis.fetch,
			apiBaseUrl: () => "https://api.example.test",
		});

		await expect(service.getSession(async () => null)).rejects.toThrow(
			"Missing Clerk session token",
		);
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("surfaces a friendly error when the bootstrap request fails", async () => {
		const fetchForService: typeof globalThis.fetch = async () =>
			responseFixture({}, false);
		const service = createSessionBootstrapService({
			fetch: fetchForService,
			apiBaseUrl: () => "https://api.example.test",
		});

		await expect(service.getSession(async () => "token")).rejects.toThrow(
			"Unable to prepare your Household",
		);
	});
});

function sessionBootstrapFixture(): BootstrapResponse {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery",
			firstName: "Avery",
			lastName: "Chen",
		},
		activeHousehold: { id: "hh_avery", name: "Avery's Home" },
		households: [
			{ id: "hh_avery", name: "Avery's Home", role: "owner", isActive: true },
		],
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner",
			displayName: "Avery",
		},
		members: [
			{
				membershipId: "mbr_avery",
				userId: "usr_avery",
				role: "owner",
				displayName: "Avery",
			},
		],
	};
}

function responseFixture(payload: unknown, ok = true): Response {
	const response: Pick<Response, "json" | "ok"> = {
		ok,
		json: async () => payload,
	};
	return response as Response;
}
