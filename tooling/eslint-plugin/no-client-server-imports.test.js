const { RuleTester } = require("eslint");
const rule = require("./no-client-server-imports");

const ruleTester = new RuleTester({
	languageOptions: {
		ecmaVersion: 2022,
		sourceType: "module",
		parserOptions: {
			ecmaFeatures: { jsx: true },
		},
	},
});

ruleTester.run("no-client-server-imports", rule, {
	valid: [
		{
			filename: "/repo/src/client/features/list/item-service.ts",
			code: `import { createAppId } from "@/shared/ids";`,
		},
		{
			filename: "/repo/src/app/api/households+api.ts",
			code: `async function load() { return import("@/server/households/api"); }`,
		},
		{
			filename: "/repo/src/server/households/api.ts",
			code: `import { createHandler } from "@/server/http";`,
		},
		{
			filename: "/repo/src/client/session/provider.test.tsx",
			code: `import { createHandler } from "@/server/http";`,
		},
	],
	invalid: [
		{
			filename: "/repo/src/client/features/household/api.ts",
			code: `import { createHandler } from "@/server/households/api";`,
			errors: [{ messageId: "noServerImport" }],
		},
		{
			filename: "/repo/src/app/_layout.tsx",
			code: `import { createHandler } from "@/server/http";`,
			errors: [{ messageId: "noServerImport" }],
		},
	],
});
