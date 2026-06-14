import { sentryPluginOptionsForEnv } from "./app.config";

type TestConfigEnv = Record<string, string | undefined>;

describe("Sentry Expo config plugin options", () => {
	const completeUploadConfig: TestConfigEnv = {
		SENTRY_AUTH_TOKEN: "token",
		SENTRY_ORG: "dont-forget",
		SENTRY_PROJECT: "ios",
	};

	it("sets SENTRY_DISABLE_AUTO_UPLOAD for local and test builds", () => {
		const localConfig = { ...completeUploadConfig };
		const testConfig = { ...completeUploadConfig };

		expect(sentryPluginOptionsForEnv("local", localConfig)).not.toHaveProperty(
			"disableAutoUpload",
		);
		expect(localConfig.SENTRY_DISABLE_AUTO_UPLOAD).toBe("true");
		expect(sentryPluginOptionsForEnv("test", testConfig)).not.toHaveProperty(
			"disableAutoUpload",
		);
		expect(testConfig.SENTRY_DISABLE_AUTO_UPLOAD).toBe("true");
	});

	it("sets SENTRY_DISABLE_AUTO_UPLOAD for deployed builds with incomplete upload config", () => {
		const missingToken: TestConfigEnv = { SENTRY_PROJECT: "ios" };
		const missingProject: TestConfigEnv = {
			SENTRY_AUTH_TOKEN: "token",
			SENTRY_ORG: "dont-forget",
		};

		expect(sentryPluginOptionsForEnv("staging", missingToken)).toEqual({
			project: "ios",
		});
		expect(missingToken.SENTRY_DISABLE_AUTO_UPLOAD).toBe("true");
		expect(sentryPluginOptionsForEnv("production", missingProject)).toEqual({
			organization: "dont-forget",
		});
		expect(missingProject.SENTRY_DISABLE_AUTO_UPLOAD).toBe("true");
	});

	it("preserves source map auto-upload for deployed builds with complete upload config", () => {
		const stagingConfig = { ...completeUploadConfig };
		const productionConfig = { ...completeUploadConfig };

		expect(sentryPluginOptionsForEnv("staging", stagingConfig)).toMatchObject({
			organization: "dont-forget",
			project: "ios",
		});
		expect(stagingConfig.SENTRY_DISABLE_AUTO_UPLOAD).toBeUndefined();
		expect(
			sentryPluginOptionsForEnv("production", productionConfig),
		).toMatchObject({
			organization: "dont-forget",
			project: "ios",
		});
		expect(productionConfig.SENTRY_DISABLE_AUTO_UPLOAD).toBeUndefined();
	});
});
