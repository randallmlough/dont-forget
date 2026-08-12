/** @type {import("jest").Config} */
module.exports = {
	testEnvironment: "node",
	testMatch: ["<rootDir>/infra/**/*.test.ts", "<rootDir>/scripts/**/*.test.ts"],
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
