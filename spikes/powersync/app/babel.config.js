module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Required by @powersync/react-native for async-iterator (watched query) support.
    plugins: ['@babel/plugin-transform-async-generator-functions'],
  };
};
