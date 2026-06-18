import {
	sentryPluginOptionsForEnv,
	setSentryDisableAutoUploadForIosBuildPhases,
	withLocalConfigPlugins,
} from "./app.config";

type TestConfigEnv = Record<string, string | undefined>;
type TestBuildPhase = {
	name?: string;
	shellScript?: string;
};

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

describe("Sentry iOS build phase auto-upload disabling", () => {
	const nodeBinaryFallback = "$" + "{NODE_BINARY:-node}";

	it("inserts the disable plugin before an appended Sentry plugin", () => {
		const plugins = withLocalConfigPlugins([], "local") ?? [];

		expect(plugins[0]).toEqual(expect.any(Function));
		expect(plugins[1]).toEqual([
			"@sentry/react-native/expo",
			expect.any(Object),
		]);
	});

	it("inserts the disable plugin before a pre-existing Sentry plugin", () => {
		const sentryPlugin: [string, { project: string }] = [
			"@sentry/react-native/expo",
			{ project: "existing-ios" },
		];

		const plugins = withLocalConfigPlugins([sentryPlugin], "local") ?? [];

		expect(plugins[0]).toEqual(expect.any(Function));
		expect(plugins[1]).toBe(sentryPlugin);
	});

	it("exports SENTRY_DISABLE_AUTO_UPLOAD in Sentry iOS shell phases", () => {
		const buildPhases: Record<string, TestBuildPhase> = {
			uploadSourceMaps: {
				name: "Bundle React Native code and images",
				shellScript:
					"\"/bin/sh `\"$NODE_BINARY\" --print \"require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode.sh'\"`\"",
			},
			uploadDebugSymbols: {
				name: "Upload Debug Symbols to Sentry",
				shellScript: `"/bin/sh \`${nodeBinaryFallback} --print "require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode-debug-files.sh'"\`"`,
			},
			other: {
				name: "Other",
				shellScript: '"echo ok"',
			},
		};

		setSentryDisableAutoUploadForIosBuildPhases({
			pbxShellScriptBuildPhaseObj: () => buildPhases,
		});

		expect(buildPhases.uploadSourceMaps?.shellScript).toContain(
			'"export SENTRY_DISABLE_AUTO_UPLOAD=true\\n/bin/sh',
		);
		expect(buildPhases.uploadDebugSymbols?.shellScript).toContain(
			'"export SENTRY_DISABLE_AUTO_UPLOAD=true\\n/bin/sh',
		);
		expect(buildPhases.other?.shellScript).toBe('"echo ok"');
	});

	it("does not duplicate an existing SENTRY_DISABLE_AUTO_UPLOAD export", () => {
		const buildPhases: Record<string, TestBuildPhase> = {
			uploadDebugSymbols: {
				shellScript: `"export SENTRY_DISABLE_AUTO_UPLOAD=true\\n/bin/sh \`${nodeBinaryFallback} --print "require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode-debug-files.sh'"\`"`,
			},
		};

		setSentryDisableAutoUploadForIosBuildPhases({
			pbxShellScriptBuildPhaseObj: () => buildPhases,
		});

		expect(
			buildPhases.uploadDebugSymbols?.shellScript?.match(
				/export SENTRY_DISABLE_AUTO_UPLOAD=true/g,
			),
		).toHaveLength(1);
	});
});
