const { RuleTester } = require("eslint");
const rule = require("./no-server-service-imports");

const ruleTester = new RuleTester({
	languageOptions: {
		ecmaVersion: 2022,
		sourceType: "module",
	},
});

ruleTester.run("no-server-service-imports", rule, {
	valid: [
		{
			filename: "/repo/screens/home/use-home-content.ts",
			code: `import { createItemService } from "@/lib/services/item";`,
		},
		{
			filename: "/repo/lib/services/item/index.ts",
			code: `export { createItemService } from "./item-service";`,
		},
		{
			filename: "/repo/lib/services/session/server/index.ts",
			code: `export { bootstrapAuthenticatedAppSession } from "./bootstrap";`,
		},
		{
			filename: "/repo/lib/services/session/server/bootstrap.ts",
			code: `import { createUserService } from "@/lib/services/user/server";`,
		},
		{
			filename: "/repo/app/api/bootstrap+api.ts",
			code: `
				export async function POST() {
					const server = await import("@/lib/services/session/server");
					return Response.json(server);
				}
			`,
		},
		{
			filename: "/repo/lib/api/invitations/handlers.ts",
			code: `import { createInvitationService } from "@/lib/services/invitation/server";`,
		},
		{
			filename: "/repo/lib/services/session/server/bootstrap.test.ts",
			code: `import { createUserService } from "@/lib/services/user/server";`,
		},
	],
	invalid: [
		{
			filename: "/repo/screens/home/use-home-content.ts",
			code: `import { createUserService } from "@/lib/services/user/server";`,
			errors: [{ messageId: "appFacing" }],
		},
		{
			filename: "/repo/components/auth/auth-gate.tsx",
			code: `const server = import("@/lib/services/auth/server");`,
			errors: [{ messageId: "appFacing" }],
		},
		{
			filename: "/repo/app/api/bootstrap+api.ts",
			code: `import { createAuthService } from "@/lib/services/auth/server";`,
			errors: [{ messageId: "apiStatic" }],
		},
		{
			filename: "/repo/lib/services/household/index.ts",
			code: `export * from "./server";`,
			errors: [{ messageId: "appSafeIndex" }],
		},
		{
			filename: "/repo/lib/services/household/index.ts",
			code: `import { bootstrapAuthenticatedAppSession } from "./server/bootstrap";`,
			errors: [{ messageId: "appSafeIndex" }],
		},
		{
			filename: "/repo/lib/services/household/index.ts",
			code: `export { createUserService } from "../user/server";`,
			errors: [{ messageId: "appSafeIndex" }],
		},
		{
			filename: "/repo/screens/home/use-home-content.ts",
			code: `import { createUserService } from "../../lib/services/user/server";`,
			errors: [{ messageId: "appFacing" }],
		},
	],
});
