// Metro config for the spike.
// @powersync/react-native does a dynamic require() of the SQLite adapter from
// its pre-bundled dist. Metro's inline-requires optimization breaks that
// dynamic require ("Could not resolve @journeyapps/react-native-quick-sqlite"),
// so we exclude the SDK from inline requires. Per the @powersync/react-native
// README.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformer.getTransformOptions = async () => ({
  transform: {
    inlineRequires: {
      blockList: {
        [require.resolve('@powersync/react-native')]: true,
      },
    },
  },
});

module.exports = config;
