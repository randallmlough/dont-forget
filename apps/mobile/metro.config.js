const { getDefaultConfig } = require("expo/metro-config");
const { withStorybook } = require("@storybook/react-native/withStorybook");

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [...config.resolver.blockList, /[/\\]\.omx[/\\].*/];

module.exports = withStorybook(config);
