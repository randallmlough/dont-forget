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
			filename: "/repo/lib/unistyles/palette.ts",
			code: `export const brandPalette = { green700: "#2F855A" };`,
		},
		{
			filename: "/repo/lib/unistyles/unistyles.test.ts",
			code: `expect(theme.colors.primary).toBe("#2F855A");`,
		},
		{
			filename: "/repo/components/button.tsx",
			code: `const styles = { color: theme.colors.primary };`,
		},
	],
	invalid: [
		{
			filename: "/repo/components/button.tsx",
			code: `const styles = { color: "#2F855A" };`,
			errors: [{ messageId: "rawColor" }],
		},
		{
			filename: "/repo/screens/home/home-screen.tsx",
			code: `const styles = { backgroundColor: "rgba(255, 255, 255, 0.8)" };`,
			errors: [{ messageId: "rawColor" }],
		},
		{
			filename: "/repo/app/_layout.tsx",
			code: "const color = `hsl(120, 50%, 50%)`;",
			errors: [{ messageId: "rawColor" }],
		},
	],
});
