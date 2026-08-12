/** @type {import("jest").Config} */
module.exports = {
	preset: "jest-expo",
	setupFiles: [
		"react-native-unistyles/mocks",
		"<rootDir>/src/theme/unistyles.ts",
	],
	setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
	testTimeout: 20000,
	testMatch: ["<rootDir>/**/*.test.ts", "<rootDir>/**/*.test.tsx"],
	moduleNameMapper: {
		"^@mobile/(.*)$": "<rootDir>/src/$1",
		"^yaml$": "<rootDir>/../../node_modules/yaml/dist/index.js",
	},
	transformIgnorePatterns: [
		"node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?[/+].*|expo-router|@expo-google-fonts[/+].*|react-native-svg|@clerk[/+].*|@powersync[/+].*))",
	],
	collectCoverageFrom: [
		"app/**/*.{ts,tsx}",
		"src/**/*.{ts,tsx}",
		"!**/*.d.ts",
		"!**/*.test.{ts,tsx}",
		"!src/test/**/*",
	],
};
