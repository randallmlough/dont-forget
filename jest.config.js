/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFiles: ["react-native-unistyles/mocks", "<rootDir>/lib/unistyles/unistyles.ts"],
  setupFilesAfterEnv: ["<rootDir>/lib/test/setup.ts"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  moduleNameMapper: {
    // Keep Jest aligned with Metro: Drizzle may resolve the libsql package root.
    "^@libsql/client$": "@libsql/client/http",
    "^@/(.*)$": "<rootDir>/$1",
  },
  transformIgnorePatterns: [
    "node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|expo-router|@expo-google-fonts/.*|@react-navigation/.*|react-native-svg|@clerk/.*))",
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
    "!db/test.ts",
    "!lib/test/**/*",
  ],
};
