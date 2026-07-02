const { RuleTester } = require("eslint");
const rule = require("./no-db-server-imports");

const ruleTester = new RuleTester({
	languageOptions: {
		ecmaVersion: 2022,
		sourceType: "module",
	},
});

ruleTester.run("no-db-server-imports", rule, {
	valid: [
		{
			filename: "/repo/lib/services/household/server/household-service.ts",
			code: `import { directoryDb } from "@/db/server/client";`,
		},
		{
			filename: "/repo/lib/api/shared.ts",
			code: `import { directoryClient, directoryDb } from "@/db/server/client";`,
		},
		{
			filename: "/repo/db/server/migrate.ts",
			code: `import { directoryClient } from "./client";`,
		},
		{
			filename: "/repo/scripts/seed.ts",
			code: `import { householdClient } from "@/db/server/client";`,
		},
		{
			filename: "/repo/lib/services/session/services.test.ts",
			code: `import { createTestHouseholdDb } from "@/db/server/test";`,
		},
		{
			filename: "/repo/app/api/bootstrap+api.ts",
			code: `export async function GET() { const db = await import("@/db/server/client"); }`,
		},
		{
			filename: "/repo/lib/services/item/item-service.ts",
			code: `import { sqlNumberSchema } from "@/db/utils";`,
		},
		{
			filename: "/repo/lib/services/list/list-service.ts",
			code: `import { sqlNumberSchema } from "@/db/utils";`,
		},
	],
	invalid: [
		{
			filename: "/repo/lib/services/item/item-service.ts",
			code: `import { householdDb } from "@/db/server/client";`,
			errors: [{ messageId: "serverOnly" }],
		},
		{
			filename: "/repo/lib/services/session/services.ts",
			code: `import { directoryClient } from "@/db/server/client";`,
			errors: [{ messageId: "serverOnly" }],
		},
		{
			filename: "/repo/lib/powersync/database.ts",
			code: `import { directoryDb } from "@/db/server/client";`,
			errors: [{ messageId: "serverOnly" }],
		},
		{
			filename: "/repo/screens/home/use-home-content.ts",
			code: `import { directoryDb } from "@/db/server/client";`,
			errors: [{ messageId: "serverOnly" }],
		},
		{
			filename: "/repo/app/api/bootstrap+api.ts",
			code: `import { directoryClient } from "@/db/server/client";`,
			errors: [{ messageId: "apiStatic" }],
		},
		{
			filename: "/repo/app/api/bootstrap+api.ts",
			code: `const db = import("@/db/server/client");`,
			errors: [{ messageId: "apiStatic" }],
		},
	],
});
