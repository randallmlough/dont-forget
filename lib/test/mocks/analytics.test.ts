import {
	createMockAnalytics,
	expectAnalyticsTrackCallsToOmitSecrets,
} from "./analytics";

describe("analytics test helpers", () => {
	it("passes when tracked events omit Invitation and Household Join Code secrets", () => {
		const analytics = createMockAnalytics();

		analytics.track("authenticated_app_session_loaded", {
			household_id: "hh_avery",
			member_role: "member",
			member_count: 2,
			source: "online",
		});

		expectAnalyticsTrackCallsToOmitSecrets(analytics.track, [
			"avery@example.com",
			"ABCDEFGH",
			"invitation-token-pending-email",
		]);
	});

	it("fails when a tracked event includes a secret value", () => {
		const analytics = createMockAnalytics();

		analytics.track("authenticated_app_session_cached", {
			household_id: "hh_avery:ABCDEFGH",
			member_role: "owner",
			member_count: 1,
		});

		expect(() =>
			expectAnalyticsTrackCallsToOmitSecrets(analytics.track, ["ABCDEFGH"]),
		).toThrow();
	});
});
