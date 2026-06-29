import {
	createSessionBootstrapService,
	sessionAnalyticsProperties,
} from "./bootstrap";

describe("createSessionBootstrapService", () => {
	it("loads and parses a directory-only Authenticated App Session bootstrap", async () => {
		const fetch = jest.fn(async () => response(bootstrapPayload()));
		const analytics = { track: jest.fn() };
		const service = createSessionBootstrapService({
			fetch,
			apiBaseUrl: () => "https://api.example",
			analytics,
		});

		await expect(service.getSession(async () => "token")).resolves.toEqual(
			bootstrapPayload(),
		);
		expect(fetch).toHaveBeenCalledWith("https://api.example/api/bootstrap", {
			method: "POST",
			headers: { Authorization: "Bearer token" },
		});
		expect(analytics.track).toHaveBeenCalledWith(
			"authenticated_app_session_loaded",
			{
				household_id: "hh_1",
				member_role: "owner",
				member_count: 1,
				source: "online",
			},
		);
	});
});

describe("sessionAnalyticsProperties", () => {
	it("derives stable analytics properties from the bootstrap response", () => {
		expect(sessionAnalyticsProperties(bootstrapPayload())).toEqual({
			household_id: "hh_1",
			member_role: "owner",
			member_count: 1,
		});
	});
});

function bootstrapPayload() {
	return {
		user: {
			id: "usr_1",
			email: "avery@example.com",
			displayName: "Avery",
			firstName: "Avery",
			lastName: null,
		},
		activeHousehold: { id: "hh_1", name: "Avery" },
		households: [
			{ id: "hh_1", name: "Avery", role: "owner" as const, isActive: true },
		],
		activeMember: {
			id: "mbr_1",
			userId: "usr_1",
			role: "owner" as const,
			displayName: "Avery",
		},
		members: [
			{
				membershipId: "mbr_1",
				userId: "usr_1",
				role: "owner" as const,
				displayName: "Avery",
			},
		],
	};
}

function response(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		headers: { "content-type": "application/json" },
		status: 200,
	});
}
