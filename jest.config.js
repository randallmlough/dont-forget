/** @type {import('jest').Config} */
module.exports = {
	preset: "jest-expo",
	setupFiles: [
		"react-native-unistyles/mocks",
		"<rootDir>/src/client/theme/unistyles.ts",
	],
	setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
	// Directory-DB tests boot PGlite (WASM Postgres) in a child process and run
	// migrations; the first such test per run also generates the PGlite template.
	// That cold start exceeds Jest's 5s default on CI hardware, so widen the budget.
	testTimeout: 20000,
	testMatch: ["**/*.test.ts", "**/*.test.tsx"],
	testPathIgnorePatterns: ["<rootDir>/\\.claude/"],
	modulePathIgnorePatterns: ["<rootDir>/\\.claude/"],
	watchPathIgnorePatterns: ["<rootDir>/\\.claude/"],
	moduleNameMapper: {
		"^@/(.*)$": "<rootDir>/src/$1",
	},
	transformIgnorePatterns: [
		// pnpm encodes the scope separator as `+` inside `.pnpm` (e.g. `@expo+ui@...`),
		// so scoped allowlist entries must accept both `/` and `+`.
		"node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?[/+].*|expo-router|@expo-google-fonts[/+].*|react-native-svg|@clerk[/+].*|@powersync[/+].*))",
	],
	collectCoverageFrom: [
		"src/app/**/*.{ts,tsx}",
		"src/components/**/*.{ts,tsx}",
		"src/constants/**/*.{ts,tsx}",
		"src/server/**/*.{ts,tsx}",
		"src/shared/**/*.{ts,tsx}",
		"src/hooks/**/*.{ts,tsx}",
		"src/lib/**/*.{ts,tsx}",
		"src/screens/**/*.{ts,tsx}",
		"!**/*.d.ts",
		"!**/*.test.{ts,tsx}",
		"!**/db/migrations/**",
		"!src/server/db/test.ts",
		"!src/test/**/*",
	],
};
