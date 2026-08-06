/** @type {import("jest").Config} */
module.exports = {
	testEnvironment: "node",
	testTimeout: 20000,
	testMatch: ["<rootDir>/**/*.test.ts", "<rootDir>/**/*.test.tsx"],
	moduleNameMapper: {
		"^@api/(.*)$": "<rootDir>/src/$1",
	},
	transform: {
		"^.+\\.tsx?$": [
			"babel-jest",
			{
				plugins: ["@babel/plugin-transform-modules-commonjs"],
				presets: ["@babel/preset-typescript"],
			},
		],
	},
	collectCoverageFrom: [
		"src/**/*.{ts,tsx}",
		"!**/*.d.ts",
		"!**/*.test.{ts,tsx}",
		"!src/test/**/*",
	],
};
