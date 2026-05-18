const { RuleTester } = require("eslint");
const rule = require("./no-screen-use-effect");

const ruleTester = new RuleTester({
	languageOptions: {
		ecmaVersion: 2022,
		sourceType: "module",
		parserOptions: {
			ecmaFeatures: { jsx: true },
		},
	},
});

ruleTester.run("no-screen-use-effect", rule, {
	valid: [
		{
			filename: "/repo/screens/home/use-home-bootstrap.ts",
			code: `
				import { useEffect } from "react";
				useEffect(() => { void adapter.load(); }, [adapter]);
			`,
		},
		{
			filename: "/repo/screens/home/home-screen.tsx",
			code: `
				export function HomeScreen() { return null; }
			`,
		},
		{
			filename: "/repo/app/_layout.tsx",
			code: `
				import { useEffect } from "react";
				useEffect(() => { screen("/home"); }, []);
			`,
		},
		{
			filename: "/repo/screens/home/home-screen.test.tsx",
			code: `
				import { useEffect } from "react";
				useEffect(() => {}, []);
			`,
		},
	],
	invalid: [
		{
			filename: "/repo/screens/home/home-screen.tsx",
			code: `
				import { useEffect } from "react";
				useEffect(() => { screen("/home"); }, []);
			`,
			errors: [{ messageId: "moveToHook" }],
		},
	],
});
