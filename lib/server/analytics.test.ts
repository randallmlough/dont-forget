import { createServerAnalytics } from "./analytics";

describe("createServerAnalytics", () => {
	it("captures server product events with a User distinct id", () => {
		const client = {
			capture: jest.fn(),
			flush: jest.fn(async () => undefined),
		};
		const analytics = createServerAnalytics({
			appEnv: "test",
			client,
		});

		analytics.track("invitation_accepted", {
			household_id: "hh_avery",
			user_id: "usr_avery",
			membership_created: true,
		});

		expect(client.capture).toHaveBeenCalledWith({
			distinctId: "usr_avery",
			event: "invitation_accepted",
			properties: {
				household_id: "hh_avery",
				user_id: "usr_avery",
				membership_created: true,
				app_env: "test",
				runtime: "server",
			},
		});
	});

	it("uses actor-specific ids when events do not have user_id", () => {
		const client = {
			capture: jest.fn(),
			flush: jest.fn(async () => undefined),
		};
		const analytics = createServerAnalytics({ client });

		analytics.track("invitation_created", {
			household_id: "hh_avery",
			creator_user_id: "usr_creator",
			source: "email",
			reused_existing: false,
		});
		analytics.track("household_join_code_regenerated", {
			household_id: "hh_avery",
			requested_by_user_id: "usr_requester",
		});

		expect(client.capture).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ distinctId: "usr_creator" }),
		);
		expect(client.capture).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ distinctId: "usr_requester" }),
		);
	});
});
