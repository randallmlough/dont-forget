import {
	createServerAnalytics,
	installServerAnalytics,
	serverServiceAnalytics,
} from "./analytics";

function enabledConfig(client: {
	capture: jest.Mock;
	flush: jest.Mock<Promise<void>, []>;
}) {
	return {
		appEnv: "test" as const,
		posthog: {
			kind: "enabled" as const,
			projectToken: "phc_synthetic",
			host: "https://posthog.invalid",
		},
		client,
	};
}

describe("createServerAnalytics", () => {
	it("captures server product events with a User distinct id", () => {
		const client = {
			capture: jest.fn(),
			flush: jest.fn(async () => undefined),
		};
		const runtime = createServerAnalytics(enabledConfig(client));

		runtime.analytics.track("invitation_accepted", {
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
		const runtime = createServerAnalytics(enabledConfig(client));

		runtime.analytics.track("invitation_created", {
			household_id: "hh_avery",
			creator_user_id: "usr_creator",
			source: "email",
			reused_existing: false,
		});
		runtime.analytics.track("household_join_code_regenerated", {
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

	it("keeps disabled analytics independent from raw environment values", () => {
		const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
		const originalToken = process.env.POSTHOG_PROJECT_TOKEN;
		process.env.POSTHOG_PROJECT_TOKEN = "phc_raw_env_must_be_ignored";

		try {
			const runtime = createServerAnalytics({
				appEnv: "local",
				posthog: { kind: "disabled" },
			});

			runtime.analytics.track("invitation_accepted", {
				household_id: "hh_avery",
				user_id: "usr_avery",
				membership_created: true,
			});
			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining("Server analytics will be disabled"),
			);
		} finally {
			if (originalToken === undefined) {
				delete process.env.POSTHOG_PROJECT_TOKEN;
			} else {
				process.env.POSTHOG_PROJECT_TOKEN = originalToken;
			}
			warn.mockRestore();
		}
	});

	it("installs the configured runtime for service defaults", () => {
		const client = {
			capture: jest.fn(),
			flush: jest.fn(async () => undefined),
		};
		const runtime = createServerAnalytics(enabledConfig(client));
		installServerAnalytics(runtime);

		serverServiceAnalytics.track("invitation_revoked", {
			household_id: "hh_avery",
			revoked_by_user_id: "usr_avery",
		});

		expect(client.capture).toHaveBeenCalledTimes(1);
	});

	it("exposes the configured client flush and propagates its failure", async () => {
		const flushError = new Error("synthetic flush failure");
		const successClient = {
			capture: jest.fn(),
			flush: jest.fn(async () => undefined),
		};
		const failureClient = {
			capture: jest.fn(),
			flush: jest.fn(async () => {
				throw flushError;
			}),
		};

		await expect(
			createServerAnalytics(enabledConfig(successClient)).flush(),
		).resolves.toBeUndefined();
		expect(successClient.flush).toHaveBeenCalledTimes(1);
		await expect(
			createServerAnalytics(enabledConfig(failureClient)).flush(),
		).rejects.toBe(flushError);
	});
});
