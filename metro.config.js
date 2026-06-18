const { getDefaultConfig } = require("expo/metro-config");
const { withSentryConfig } = require("@sentry/react-native/metro");
const { withStorybook } = require("@storybook/react-native/withStorybook");

const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.blockList = [...config.resolver.blockList, /[/\\]\.omx[/\\].*/];

config.resolver.resolveRequest = (context, moduleName, platform) => {
	if (moduleName === "@libsql/client") {
		// Drizzle's libsql adapter resolves the package root; native bundles must use the HTTP entrypoint.
		return context.resolveRequest(context, "@libsql/client/http", platform);
	}

	if (defaultResolveRequest) {
		return defaultResolveRequest(context, moduleName, platform);
	}

	return context.resolveRequest(context, moduleName, platform);
};

module.exports = withSentryConfig(withStorybook(config));
