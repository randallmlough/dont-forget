import { sentryPluginOptionsForEnv } from "./app.config";

describe("Sentry Expo config plugin options", () => {
	const completeUploadConfig = {
		SENTRY_AUTH_TOKEN: "token",
		SENTRY_ORG: "dont-forget",
		SENTRY_PROJECT: "ios",
	};

	it("disables source map auto-upload for local and test builds", () => {
		expect(
			sentryPluginOptionsForEnv("local", completeUploadConfig)
				.disableAutoUpload,
		).toBe(true);
		expect(
			sentryPluginOptionsForEnv("test", completeUploadConfig).disableAutoUpload,
		).toBe(true);
	});

	it("disables source map auto-upload for deployed builds with incomplete upload config", () => {
		expect(
			sentryPluginOptionsForEnv("staging", {
				SENTRY_PROJECT: "ios",
			}).disableAutoUpload,
		).toBe(true);
		expect(
			sentryPluginOptionsForEnv("production", {
				SENTRY_AUTH_TOKEN: "token",
				SENTRY_ORG: "dont-forget",
			}).disableAutoUpload,
		).toBe(true);
	});

	it("preserves source map auto-upload for deployed builds with complete upload config", () => {
		expect(
			sentryPluginOptionsForEnv("staging", completeUploadConfig),
		).toMatchObject({
			disableAutoUpload: false,
			organization: "dont-forget",
			project: "ios",
		});
		expect(
			sentryPluginOptionsForEnv("production", completeUploadConfig),
		).toMatchObject({
			disableAutoUpload: false,
			organization: "dont-forget",
			project: "ios",
		});
	});
});
