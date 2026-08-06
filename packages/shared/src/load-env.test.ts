import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadEnvFile } from "./load-env";

const mutatedEnvKeys = [
	"APP_ENV",
	"API_PORT",
	"WEB_PORT",
	"PUBLIC_WEB_BASE_URL",
	"BASE_ONLY_KEY",
	"TEST_ONLY_KEY",
	"STAGING_ONLY_KEY",
	"PRODUCTION_ONLY_KEY",
] as const;

const originalCwd = process.cwd();
const originalEnv = new Map<string, string | undefined>();
const tempRoots: string[] = [];

beforeAll(() => {
	for (const key of mutatedEnvKeys) {
		originalEnv.set(key, process.env[key]);
	}
});

beforeEach(() => {
	for (const key of mutatedEnvKeys) {
		delete process.env[key];
	}
});

afterEach(async () => {
	process.chdir(originalCwd);
	for (const key of mutatedEnvKeys) {
		const value = originalEnv.get(key);
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
	await Promise.all(
		tempRoots
			.splice(0)
			.map((root) => rm(root, { force: true, recursive: true })),
	);
});

async function createTempCwd(): Promise<string> {
	const root = await mkdtemp(path.join(tmpdir(), "dont-forget-load-env-"));
	tempRoots.push(root);
	process.chdir(root);
	return root;
}

async function writeEnvFile(
	root: string,
	name: string,
	values: Record<string, string>,
): Promise<void> {
	await writeFile(
		path.join(root, name),
		Object.entries(values)
			.map(([key, value]) => `${key}=${value}`)
			.join("\n"),
	);
}

describe("loadEnvFile", () => {
	it("loads local worktree values before local base values", async () => {
		const root = await createTempCwd();
		await writeEnvFile(root, ".env.local", {
			API_PORT: "8080",
			BASE_ONLY_KEY: "base",
			PUBLIC_WEB_BASE_URL: "http://localhost:3000",
			WEB_PORT: "3000",
		});
		await writeEnvFile(root, ".env.worktree", {
			API_PORT: "18087",
			PUBLIC_WEB_BASE_URL: "http://localhost:13087",
			WEB_PORT: "13087",
		});
		process.env.APP_ENV = "local";

		expect(loadEnvFile()).toBe("local");

		expect(process.env.API_PORT).toBe("18087");
		expect(process.env.WEB_PORT).toBe("13087");
		expect(process.env.PUBLIC_WEB_BASE_URL).toBe("http://localhost:13087");
		expect(process.env.BASE_ONLY_KEY).toBe("base");
	});

	it("preserves explicit process values over local dotenv files", async () => {
		const root = await createTempCwd();
		await writeEnvFile(root, ".env.local", {
			API_PORT: "8080",
			PUBLIC_WEB_BASE_URL: "http://localhost:3000",
			WEB_PORT: "3000",
		});
		await writeEnvFile(root, ".env.worktree", {
			API_PORT: "18087",
			PUBLIC_WEB_BASE_URL: "http://localhost:13087",
			WEB_PORT: "13087",
		});
		process.env.APP_ENV = "local";
		process.env.API_PORT = "19001";
		process.env.WEB_PORT = "14001";
		process.env.PUBLIC_WEB_BASE_URL = "http://localhost:14001";

		expect(loadEnvFile()).toBe("local");

		expect(process.env.API_PORT).toBe("19001");
		expect(process.env.WEB_PORT).toBe("14001");
		expect(process.env.PUBLIC_WEB_BASE_URL).toBe("http://localhost:14001");
	});

	it("naturally uses local base values when the worktree overlay is missing", async () => {
		const root = await createTempCwd();
		await writeEnvFile(root, ".env.local", {
			API_PORT: "8080",
			PUBLIC_WEB_BASE_URL: "http://localhost:3000",
			WEB_PORT: "3000",
		});
		process.env.APP_ENV = "local";

		expect(loadEnvFile()).toBe("local");

		expect(process.env.API_PORT).toBe("8080");
		expect(process.env.WEB_PORT).toBe("3000");
		expect(process.env.PUBLIC_WEB_BASE_URL).toBe("http://localhost:3000");
	});

	it("loads from an explicit cwd without changing the process cwd", async () => {
		const root = await createTempCwd();
		await writeEnvFile(root, ".env.worktree", {
			API_PORT: "18087",
			PUBLIC_WEB_BASE_URL: "http://localhost:13087",
			WEB_PORT: "13087",
		});
		process.chdir(originalCwd);
		process.env.APP_ENV = "local";

		expect(loadEnvFile({ cwd: root })).toBe("local");

		expect(process.cwd()).toBe(originalCwd);
		expect(process.env.API_PORT).toBe("18087");
		expect(process.env.WEB_PORT).toBe("13087");
		expect(process.env.PUBLIC_WEB_BASE_URL).toBe("http://localhost:13087");
	});

	it.each([
		["test", ".env.test", "TEST_ONLY_KEY"],
		["staging", ".env.staging", "STAGING_ONLY_KEY"],
		["production", ".env.production", "PRODUCTION_ONLY_KEY"],
	] as const)("ignores .env.worktree for %s", async (appEnv, envFile, key) => {
		const root = await createTempCwd();
		await writeEnvFile(root, ".env.worktree", {
			API_PORT: "18087",
			PUBLIC_WEB_BASE_URL: "http://localhost:13087",
			WEB_PORT: "13087",
		});
		await writeEnvFile(root, envFile, {
			API_PORT: "8080",
			[key]: appEnv,
			PUBLIC_WEB_BASE_URL: "https://example.invalid",
			WEB_PORT: "3000",
		});
		process.env.APP_ENV = appEnv;

		expect(loadEnvFile()).toBe(appEnv);

		expect(process.env.API_PORT).toBe("8080");
		expect(process.env.WEB_PORT).toBe("3000");
		expect(process.env.PUBLIC_WEB_BASE_URL).toBe("https://example.invalid");
		expect(process.env[key]).toBe(appEnv);
	});

	it("keeps the missing APP_ENV overload behavior", async () => {
		await createTempCwd();
		delete process.env.APP_ENV;

		expect(() => loadEnvFile()).toThrow("Missing required env var: APP_ENV");
		expect(loadEnvFile({ requireAppEnv: false })).toBeUndefined();
	});

	it("keeps invalid APP_ENV rejection", async () => {
		await createTempCwd();
		process.env.APP_ENV = "prod";

		expect(() => loadEnvFile()).toThrow('Invalid APP_ENV "prod"');
	});
});
