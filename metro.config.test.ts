describe("Metro config", () => {
	it("adds Sentry debug IDs before asset serialization", () => {
		jest.resetModules();
		const getDefaultConfig = jest.fn(() => ({
			resolver: { blockList: [] },
			serializer: {},
		}));
		const withStorybook = jest.fn((config) => config);
		const withSentryConfig = jest.fn((config) => ({
			...config,
			serializer: {
				...config.serializer,
				customSerializer: jest.fn(),
			},
		}));
		jest.doMock("expo/metro-config", () => ({
			getDefaultConfig,
		}));
		jest.doMock("@sentry/react-native/metro", () => ({
			withSentryConfig,
		}));
		jest.doMock("@storybook/react-native/withStorybook", () => ({
			withStorybook,
		}));

		// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro config is CommonJS.
		const config = require("./metro.config.js");

		expect(getDefaultConfig).toHaveBeenCalledWith(__dirname);
		expect(withStorybook).toHaveBeenCalled();
		expect(withSentryConfig).toHaveBeenCalledWith(
			withStorybook.mock.results[0].value,
		);
		expect(config.serializer?.customSerializer).toEqual(expect.any(Function));
	});
});
