// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const typescriptEslint = require("@typescript-eslint/eslint-plugin");
const reactNativeA11y = require("eslint-plugin-react-native-a11y");
const dontForget = require("./tooling/eslint-plugin");

module.exports = defineConfig([
	expoConfig,
	{
		ignores: [
			".agents/**",
			".claude/**",
			".rnstorybook/storybook.requires.ts",
			"apps/web/src/routeTree.gen.ts",
			"**/dist/**",
		],
	},
	{
		plugins: {
			"@typescript-eslint": typescriptEslint,
			"dont-forget": dontForget,
			"react-native-a11y": reactNativeA11y,
		},
		rules: {
			"dont-forget/no-client-server-imports": "error",
			"dont-forget/no-raw-color-literals": "error",
			"react-hooks/exhaustive-deps": "error",
			"@typescript-eslint/no-unused-vars": "error",
			"@typescript-eslint/consistent-type-assertions": [
				"error",
				{
					assertionStyle: "as",
					objectLiteralTypeAssertions: "never",
				},
			],
			"@typescript-eslint/no-extra-non-null-assertion": "error",
			"@typescript-eslint/no-non-null-assertion": "error",
			"@typescript-eslint/no-explicit-any": "error",
			"react-native-a11y/has-accessibility-props": "error",
			"react-native-a11y/has-valid-accessibility-actions": "error",
			"react-native-a11y/has-valid-accessibility-component-type": "error",
			"react-native-a11y/has-valid-accessibility-descriptors": "error",
			"react-native-a11y/has-valid-accessibility-role": "error",
			"react-native-a11y/has-valid-accessibility-state": "error",
			"react-native-a11y/has-valid-accessibility-value": "error",
			"react-native-a11y/no-nested-touchables": "error",
		},
	},
]);
