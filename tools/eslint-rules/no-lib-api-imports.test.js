const { RuleTester } = require("eslint");
const rule = require("./no-lib-api-imports");

const ruleTester = new RuleTester({
	languageOptions: {
		ecmaVersion: 2022,
		sourceType: "module",
	},
});

ruleTester.run("no-lib-api-imports", rule, {
	valid: [
		{
			filename: "/repo/app/api/invitations+api.ts",
			code: `
				export async function POST(request) {
					const api = await import("@/lib/api/invitations/handlers");
					return api.handleCreateInvitation(request);
				}
			`,
		},
		{
			filename: "/repo/lib/api/invitations/handlers.ts",
			code: `import { jsonResponse } from "../shared";`,
		},
		{
			filename: "/repo/lib/api/invitations/handlers.test.ts",
			code: `import { handleCreateInvitation } from "@/lib/api/invitations/handlers";`,
		},
	],
	invalid: [
		{
			filename: "/repo/components/session/provider.tsx",
			code: `import { handleCreateInvitation } from "@/lib/api/invitations/handlers";`,
			errors: [{ messageId: "appFacing" }],
		},
		{
			filename: "/repo/app/api/invitations+api.ts",
			code: `import { handleCreateInvitation } from "@/lib/api/invitations/handlers";`,
			errors: [{ messageId: "apiStatic" }],
		},
		{
			filename: "/repo/app/api/invitations+api.ts",
			code: `const handlers = import("@/lib/api/invitations/handlers");`,
			errors: [{ messageId: "apiStatic" }],
		},
		{
			filename: "/repo/screens/settings/use-invitations.ts",
			code: `const api = import("../lib/api/invitations/handlers");`,
			errors: [{ messageId: "appFacing" }],
		},
	],
});
