/** @type {import('jest').Config} */
module.exports = {
	preset: "jest-expo",
	setupFiles: [
		"react-native-unistyles/mocks",
		"<rootDir>/lib/unistyles/unistyles.ts",
	],
	setupFilesAfterEnv: ["<rootDir>/lib/test/setup.ts"],
	// Directory-DB tests boot PGlite (WASM Postgres) in a child process and run
	// migrations; the first such test per run also generates the PGlite template.
	// That cold start exceeds Jest's 5s default on CI hardware, so widen the budget.
	testTimeout: 20000,
	testMatch: ["**/*.test.ts", "**/*.test.tsx"],
	testPathIgnorePatterns: ["<rootDir>/\\.claude/"],
	modulePathIgnorePatterns: ["<rootDir>/\\.claude/"],
	watchPathIgnorePatterns: ["<rootDir>/\\.claude/"],
	moduleNameMapper: {
		"^@/(.*)$": "<rootDir>/$1",
	},
	transformIgnorePatterns: [
		// pnpm encodes the scope separator as `+` inside `.pnpm` (e.g. `@expo+ui@...`),
		// so scoped allowlist entries must accept both `/` and `+`.
		"node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?[/+].*|expo-router|@expo-google-fonts[/+].*|react-native-svg|@clerk[/+].*|@powersync[/+].*))",
	],
	collectCoverageFrom: [
		"app/**/*.{ts,tsx}",
		"components/**/*.{ts,tsx}",
		"constants/**/*.{ts,tsx}",
		"db/**/*.{ts,tsx}",
		"hooks/**/*.{ts,tsx}",
		"lib/**/*.{ts,tsx}",
		"screens/**/*.{ts,tsx}",
		"!**/*.d.ts",
		"!**/*.test.{ts,tsx}",
		"!**/db/migrations/**",
		"!db/server/test.ts",
		"!lib/test/**/*",
	],
};
