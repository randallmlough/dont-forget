/** @type {import("jest").Config} */
module.exports = {
	testEnvironment: "node",
	testMatch: ["<rootDir>/**/*.test.ts", "<rootDir>/**/*.test.tsx"],
	transform: {
		"^.+\\.tsx?$": [
			"babel-jest",
			{
				plugins: ["@babel/plugin-transform-modules-commonjs"],
				presets: ["@babel/preset-typescript"],
			},
		],
	},
};
