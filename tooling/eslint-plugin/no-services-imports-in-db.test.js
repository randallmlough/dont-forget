const { RuleTester } = require("eslint");
const rule = require("./no-services-imports-in-db");

const ruleTester = new RuleTester({
	languageOptions: {
		ecmaVersion: 2022,
		sourceType: "module",
	},
});

ruleTester.run("no-services-imports-in-db", rule, {
	valid: [
		{
			filename: "/repo/db/household-store.ts",
			code: `import { asError } from "@/shared/errors";`,
		},
		{
			filename: "/repo/db/household-store.ts",
			code: `import { logger } from "@/lib/logger";`,
		},
		{
			filename: "/repo/db/server/migrate.ts",
			code: `import { loadEnvFile } from "@/shared/load-env";`,
		},
		{
			filename: "/repo/db/server/fixtures/builders.ts",
			code: `import { DEFAULT_LIST_ID } from "@/lib/bootstrap";`,
		},
		{
			filename: "/repo/db/household-store.test.ts",
			code: `import { deferred } from "@/test/async";`,
		},
		{
			filename: "/repo/lib/services/sync/sync-coordinator.ts",
			code: `import { isSyncInterruptedError } from "@/db/household-store";`,
		},
	],
	invalid: [
		{
			filename: "/repo/db/household-store.ts",
			code: `import { nativeSyncInterruptedError } from "@/lib/services/sync/sync-errors";`,
			errors: [{ messageId: "noUpwardImport" }],
		},
		{
			filename: "/repo/db/household-store.ts",
			code: `import { SyncResult } from "@/lib/services/sync";`,
			errors: [{ messageId: "noUpwardImport" }],
		},
		{
			filename: "/repo/db/server/client.ts",
			code: `import { withDirectory } from "@/lib/api/shared";`,
			errors: [{ messageId: "noUpwardImport" }],
		},
		{
			filename: "/repo/db/server/fixtures/scenarios.ts",
			code: `import { createItemService } from "../../../lib/services/item";`,
			errors: [{ messageId: "noUpwardImport" }],
		},
		{
			filename: "/repo/db/server/reset.ts",
			code: `const services = await import("@/lib/services/household/server");`,
			errors: [{ messageId: "noUpwardImport" }],
		},
	],
});
