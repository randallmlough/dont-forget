const path = require("node:path");
const { RuleTester } = require("eslint");
const rule = require("./package-boundaries");

const repositoryRoot = path.dirname(require.resolve("../../package.json"));
const mobileFile = path.join(repositoryRoot, "apps/mobile/src/example.ts");
const apiFile = path.join(repositoryRoot, "apps/api/src/example.ts");
const dbFile = path.join(repositoryRoot, "packages/db/src/example.ts");
const webFile = path.join(repositoryRoot, "apps/web/src/example.ts");
const mobileSchemaTestFile = path.join(
	repositoryRoot,
	"apps/mobile/src/session/powersync/schema-consistency.test.ts",
);
const fixtureRoot = path.join(
	repositoryRoot,
	"tooling/eslint-plugin/fixtures/package-boundaries/workspaces/mobile",
);
const fixtureMobileSource = path.join(fixtureRoot, "src/example.ts");
const fixtureMobileTest = path.join(fixtureRoot, "src/example.test.ts");
const fixtureMobileConfig = path.join(fixtureRoot, "app.config.ts");

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
		{
			filename: mobileSchemaTestFile,
			code: `import { lists } from "@dont-forget/db/schema";`,
		},
		{
			filename: fixtureMobileTest,
			code: `import { lists } from "@fixture/db/schema";`,
		},
		{
			filename: fixtureMobileConfig,
			code: `import { lists } from "@fixture/db/schema";`,
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
		{
			filename: fixtureMobileSource,
			code: `import { lists } from "@fixture/db/schema";`,
			errors: [{ messageId: "devOnlyWorkspacePackage" }],
		},
		{
			filename: fixtureMobileSource,
			code: `import { helper } from "@fixture/escape/helper";`,
			errors: [{ messageId: "escapingAliasTarget" }],
		},
	],
});
