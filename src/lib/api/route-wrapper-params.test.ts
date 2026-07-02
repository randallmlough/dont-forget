import { readFileSync } from "node:fs";
import path from "node:path";

const dynamicRouteWrappers = [
	"src/app/api/households/[householdId]+api.ts",
	"src/app/api/households/[householdId]/members+api.ts",
	"src/app/api/households/[householdId]/invitations+api.ts",
	"src/app/api/households/[householdId]/join-code+api.ts",
	"src/app/api/households/[householdId]/join-code/regenerate+api.ts",
	"src/app/api/invitations/[invitationId]+api.ts",
] as const;

describe("dynamic API route wrappers", () => {
	it("uses Expo's direct dynamic route param shape", () => {
		for (const file of dynamicRouteWrappers) {
			const source = readFileSync(path.join(process.cwd(), file), "utf8");

			expect(source).not.toContain("context.params");
		}
	});
});
