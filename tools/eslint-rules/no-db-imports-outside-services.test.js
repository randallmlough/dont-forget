const { RuleTester } = require("eslint");
const rule = require("./no-db-imports-outside-services");

const ruleTester = new RuleTester({
	languageOptions: {
		ecmaVersion: 2022,
		sourceType: "module",
	},
});

ruleTester.run("no-db-imports-outside-services", rule, {
	valid: [
		{
			filename: "/repo/lib/services/item/item-service.ts",
			code: `import { createHouseholdStore } from "@/lib/services/household";`,
		},
		{
			filename: "/repo/lib/services/household/household-store.ts",
			code: `const runtime = await import("@tursodatabase/sync-react-native");`,
		},
		{
			filename: "/repo/lib/services/user/server/user-service.ts",
			code: `import { eq } from "drizzle-orm";`,
		},
		{
			filename: "/repo/app/api/bootstrap+api.ts",
			code: `const db = await import("@/db/client");`,
		},
		{
			filename: "/repo/screens/home/home-screen.test.tsx",
			code: `import { createClient } from "@libsql/client";`,
		},
	],
	invalid: [
		{
			filename: "/repo/screens/home/use-home-content.ts",
			code: `import { eq } from "drizzle-orm";`,
			errors: [{ messageId: "useServices" }],
		},
		{
			filename: "/repo/components/active-list/index.tsx",
			code: `import { createClient } from "@libsql/client/web";`,
			errors: [{ messageId: "useServices" }],
		},
		{
			filename: "/repo/app/(app)/index.tsx",
			code: `import { directoryClient } from "@/db/client";`,
			errors: [{ messageId: "useServices" }],
		},
		{
			filename: "/repo/components/auth/auth-gate.tsx",
			code: `const db = import("@/db/schema/household");`,
			errors: [{ messageId: "useServices" }],
		},
		{
			filename: "/repo/screens/home/use-home-content.ts",
			code: `import { Database } from "@tursodatabase/sync-react-native";`,
			errors: [{ messageId: "useServices" }],
		},
	],
});
