const { RuleTester } = require("eslint");
const rule = require("./no-raw-color-literals");

const ruleTester = new RuleTester({
	languageOptions: {
		ecmaVersion: 2022,
		sourceType: "module",
		parserOptions: {
			ecmaFeatures: { jsx: true },
		},
	},
});

ruleTester.run("no-raw-color-literals", rule, {
	valid: [
		{
			filename: "/repo/apps/mobile/src/theme/palette.ts",
			code: `export const brandPalette = { green700: "#2F855A" };`,
		},
		{
			filename: "/repo/apps/mobile/src/theme/unistyles.test.ts",
			code: `expect(theme.colors.primary).toBe("#2F855A");`,
		},
		{
			filename: "/repo/apps/mobile/src/features/list/button.tsx",
			code: `const styles = { color: theme.colors.primary };`,
		},
		{
			filename: "/repo/apps/api/src/households/api.ts",
			code: `const color = "#2F855A";`,
		},
	],
	invalid: [
		{
			filename: "/repo/apps/mobile/src/features/list/button.tsx",
			code: `const styles = { color: "#2F855A" };`,
			errors: [{ messageId: "rawColor" }],
		},
		{
			filename: "/repo/apps/mobile/src/screens/app/home-screen.tsx",
			code: `const styles = { backgroundColor: "rgba(255, 255, 255, 0.8)" };`,
			errors: [{ messageId: "rawColor" }],
		},
		{
			filename: "/repo/apps/mobile/src/features/list/card.tsx",
			code: `const styles = { boxShadow: "0 2px 8px #000000" };`,
			errors: [{ messageId: "rawColor" }],
		},
		{
			filename: "/repo/apps/mobile/app/_layout.tsx",
			code: "const color = `hsl(120, 50%, 50%)`;",
			errors: [{ messageId: "rawColor" }],
		},
		{
			filename: "/repo/apps/mobile/src/features/list/card.tsx",
			code: "const shadow = `0 2px 8px #000000`;",
			errors: [{ messageId: "rawColor" }],
		},
	],
});
