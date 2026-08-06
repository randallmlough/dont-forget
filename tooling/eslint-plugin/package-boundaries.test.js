const path = require("node:path");
const { RuleTester } = require("eslint");
const rule = require("./package-boundaries");

const repositoryRoot = path.dirname(require.resolve("../../package.json"));
const mobileFile = path.join(repositoryRoot, "apps/mobile/src/example.ts");
const apiFile = path.join(repositoryRoot, "apps/api/src/example.ts");
const dbFile = path.join(repositoryRoot, "packages/db/src/example.ts");
const webFile = path.join(repositoryRoot, "apps/web/src/example.ts");

const ruleTester = new RuleTester({
	languageOptions: {
		ecmaVersion: 2022,
		sourceType: "module",
	},
});

ruleTester.run("package-boundaries", rule, {
	valid: [
		{
			filename: mobileFile,
			code: `import { logger } from "./lib/logger";`,
		},
		{
			filename: mobileFile,
			code: `import { logger } from "@mobile/lib/logger";`,
		},
		{
			filename: mobileFile,
			code: `export { createAppId } from "@dont-forget/shared";`,
		},
		{
			filename: dbFile,
			code: `import "@dont-forget/db/migrations/postgres/0001_powersync_publication.sql";`,
		},
		{
			filename: apiFile,
			code: `async function load() { return import("@dont-forget/db/schema"); }`,
		},
	],
	invalid: [
		{
			filename: webFile,
			code: `import "../../api/src/app";`,
			errors: [{ messageId: "relativeEscape" }],
		},
		{
			filename: webFile,
			code: `import "@api/app";`,
			errors: [{ messageId: "crossPackageAlias" }],
		},
		{
			filename: webFile,
			code: `import "@dont-forget/db";`,
			errors: [{ messageId: "undeclaredWorkspacePackage" }],
		},
		{
			filename: apiFile,
			code: `export * from "@dont-forget/mobile";`,
			errors: [{ messageId: "undeclaredWorkspacePackage" }],
		},
		{
			filename: apiFile,
			code: `import "@dont-forget/shared/private";`,
			errors: [{ messageId: "unexportedWorkspaceSubpath" }],
		},
		{
			filename: webFile,
			code: `async function load() { return import("@dont-forget/db/test"); }`,
			errors: [{ messageId: "undeclaredWorkspacePackage" }],
		},
	],
});
