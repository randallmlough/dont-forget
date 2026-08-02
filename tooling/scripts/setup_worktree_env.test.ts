import { execFileSync, spawn, spawnSync } from "node:child_process";
import { cpSync } from "node:fs";
import {
	chmod,
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	readlink,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type TempRepo = {
	root: string;
	main: string;
};

type HelperResult = {
	status: number | null;
	stdout: string;
	stderr: string;
};

type CollidingWorktreeNames = {
	first: string;
	second: string;
	slot: number;
};

const helperRelativePath = path.join(
	"tooling",
	"scripts",
	"setup_worktree_env.sh",
);
const liveHelperPath = path.join(process.cwd(), helperRelativePath);
const syntheticEnv = [
	"APP_ENV=local",
	"CLERK_SECRET_KEY=sk_test_synthetic_secret",
	"HOUSEHOLD_JOIN_CODE_SECRET=synthetic-join-code-secret",
	"INVITATION_TOKEN_SECRET=synthetic-invitation-token-secret",
	"API_PORT=8080",
	"WEB_PORT=3000",
	"PUBLIC_WEB_BASE_URL=http://localhost:3000",
	"",
].join("\n");

const tempRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((root) => rm(root, { force: true, recursive: true })),
	);
});

function git(cwd: string, args: string[]): string {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
	});
}

async function createTempRepo(): Promise<TempRepo> {
	const root = await mkdtemp(path.join(tmpdir(), "dont-forget-worktree-env-"));
	tempRoots.push(root);
	const main = path.join(root, "main");
	await mkdir(main);
	git(main, ["init", "-b", "main"]);
	git(main, ["config", "user.email", "synthetic@example.invalid"]);
	git(main, ["config", "user.name", "Synthetic User"]);
	cpSync(liveHelperPath, path.join(main, helperRelativePath));
	await chmod(path.join(main, helperRelativePath), 0o755);
	git(main, ["add", helperRelativePath]);
	git(main, ["commit", "-m", "Add worktree helper"]);
	await writeFile(path.join(main, ".env.local"), syntheticEnv, { mode: 0o600 });
	return { root, main };
}

function addWorktree(repo: TempRepo, name: string): string {
	const worktree = path.join(repo.root, name);
	git(repo.main, ["worktree", "add", "-b", name, worktree]);
	return worktree;
}

function runHelper(
	cwd: string,
	env: Record<string, string | undefined> = {},
): HelperResult {
	const result = spawnSync("bash", [path.join(cwd, helperRelativePath)], {
		cwd,
		encoding: "utf8",
		env: { ...process.env, ...env },
	});
	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

function runHelperAsync(
	cwd: string,
	env: Record<string, string | undefined> = {},
): Promise<HelperResult> {
	return new Promise((resolve, reject) => {
		const child = spawn("bash", [path.join(cwd, helperRelativePath)], {
			cwd,
			env: { ...process.env, ...env },
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.on("close", (status) => {
			resolve({ status, stdout, stderr });
		});
	});
}

async function readWorktreeEnv(cwd: string): Promise<{
	apiPort: number;
	bytes: string;
	webPort: number;
}> {
	const bytes = await readFile(path.join(cwd, ".env.worktree"), "utf8");
	const lines = bytes
		.split("\n")
		.filter((line) => line.length > 0 && !line.startsWith("#"));
	const values = Object.fromEntries(
		lines.map((line) => {
			const separator = line.indexOf("=");
			return [line.slice(0, separator), line.slice(separator + 1)];
		}),
	);
	expect(Object.keys(values).sort()).toEqual([
		"API_PORT",
		"PUBLIC_WEB_BASE_URL",
		"WEB_PORT",
	]);
	expect(values.PUBLIC_WEB_BASE_URL).toBe(
		`http://localhost:${values.WEB_PORT}`,
	);
	return {
		apiPort: Number(values.API_PORT),
		bytes,
		webPort: Number(values.WEB_PORT),
	};
}

async function expectedSlotForPath(cwd: string): Promise<number> {
	const canonicalPath = await realpath(cwd);
	const output = execFileSync("cksum", {
		encoding: "utf8",
		input: canonicalPath,
	});
	const checksum = Number(output.trim().split(/\s+/)[0]);
	return checksum % 1000;
}

function slotForCanonicalPath(canonicalPath: string): number {
	const output = execFileSync("cksum", {
		encoding: "utf8",
		input: canonicalPath,
	});
	const checksum = Number(output.trim().split(/\s+/)[0]);
	return checksum % 1000;
}

async function findCollidingWorktreeNames(
	repo: TempRepo,
): Promise<CollidingWorktreeNames> {
	const canonicalRoot = await realpath(repo.root);
	const slots = new Map<number, string>();
	for (let index = 0; index <= 1100; index += 1) {
		const name = `collision-${index}`;
		const slot = slotForCanonicalPath(path.join(canonicalRoot, name));
		const existing = slots.get(slot);
		if (existing) {
			return { first: existing, second: name, slot };
		}
		slots.set(slot, name);
	}
	throw new Error("Expected to find two worktree names with the same slot");
}

function generatedWorktreeEnv(slot: number): string {
	const apiPort = 18080 + slot;
	const webPort = 13000 + slot;
	return [
		"# Generated by make worktree-env. Do not edit.",
		"# Contains only checkout-local API_PORT, WEB_PORT, and PUBLIC_WEB_BASE_URL values.",
		`API_PORT=${apiPort}`,
		`WEB_PORT=${webPort}`,
		`PUBLIC_WEB_BASE_URL=http://localhost:${webPort}`,
		"",
	].join("\n");
}

async function expectRegularPrivateFile(filePath: string): Promise<void> {
	const fileStat = await lstat(filePath);
	expect(fileStat.isFile()).toBe(true);
	expect(fileStat.isSymbolicLink()).toBe(false);
	expect((fileStat.mode & 0o777).toString(8)).toBe("600");
}

describe("setup_worktree_env.sh", () => {
	it("links an existing local env and creates a generated checkout-local env", async () => {
		const repo = await createTempRepo();
		const checkout = addWorktree(repo, "checkout-a");

		const result = runHelper(checkout);

		expect(result).toMatchObject({ status: 0 });
		const localLink = await lstat(path.join(checkout, ".env.local"));
		expect(localLink.isSymbolicLink()).toBe(true);
		await expectRegularPrivateFile(path.join(checkout, ".env.worktree"));
		const generated = await readWorktreeEnv(checkout);
		expect(Number.isInteger(generated.apiPort)).toBe(true);
		expect(Number.isInteger(generated.webPort)).toBe(true);
		expect([8080, 8081, 3000]).not.toContain(generated.apiPort);
		expect([8080, 8081, 3000]).not.toContain(generated.webPort);
	});

	it("allocates distinct pairs and preserves generated files plus shared env bytes on rerun", async () => {
		const repo = await createTempRepo();
		const checkoutA = addWorktree(repo, "checkout-a");
		const checkoutB = addWorktree(repo, "checkout-b");
		const sourceBefore = await readFile(path.join(repo.main, ".env.local"));

		expect(runHelper(checkoutA)).toMatchObject({ status: 0 });
		expect(runHelper(checkoutB)).toMatchObject({ status: 0 });
		const beforeA = await readWorktreeEnv(checkoutA);
		const beforeB = await readWorktreeEnv(checkoutB);
		const linkTargetA = await readlink(path.join(checkoutA, ".env.local"));
		expect(beforeA.apiPort).not.toBe(beforeB.apiPort);
		expect(beforeA.webPort).not.toBe(beforeB.webPort);

		expect(runHelper(checkoutA)).toMatchObject({ status: 0 });
		expect(runHelper(checkoutB)).toMatchObject({ status: 0 });

		await expect(readFile(path.join(repo.main, ".env.local"))).resolves.toEqual(
			sourceBefore,
		);
		await expect(
			readFile(path.join(checkoutA, ".env.worktree"), "utf8"),
		).resolves.toBe(beforeA.bytes);
		await expect(
			readFile(path.join(checkoutB, ".env.worktree"), "utf8"),
		).resolves.toBe(beforeB.bytes);
		await expect(readlink(path.join(checkoutA, ".env.local"))).resolves.toBe(
			linkTargetA,
		);
	});

	it("keeps copy mode for local env and does not leak secrets into generated output", async () => {
		const repo = await createTempRepo();
		const checkout = addWorktree(repo, "checkout-copy");

		const result = runHelper(checkout, { WORKTREE_ENV_MODE: "copy" });

		expect(result).toMatchObject({ status: 0 });
		await expectRegularPrivateFile(path.join(checkout, ".env.local"));
		const localCopy = await readFile(path.join(checkout, ".env.local"), "utf8");
		expect(localCopy).toBe(syntheticEnv);
		const generated = await readFile(
			path.join(checkout, ".env.worktree"),
			"utf8",
		);
		expect(generated).not.toContain("CLERK_SECRET_KEY");
		expect(generated).not.toContain("HOUSEHOLD_JOIN_CODE_SECRET");
		expect(generated).not.toContain("INVITATION_TOKEN_SECRET");
		expect(generated).not.toContain("synthetic");
	});

	it("ignores deleted prunable worktrees without pruning or reserving their generated ports", async () => {
		const repo = await createTempRepo();
		const stale = addWorktree(repo, "stale-checkout");
		const checkout = addWorktree(repo, "checkout-a");
		const expectedSlot = await expectedSlotForPath(checkout);
		await writeFile(
			path.join(stale, ".env.worktree"),
			[
				"# Generated by make worktree-env. Do not edit.",
				`API_PORT=${18080 + expectedSlot}`,
				`WEB_PORT=${13000 + expectedSlot}`,
				`PUBLIC_WEB_BASE_URL=http://localhost:${13000 + expectedSlot}`,
				"",
			].join("\n"),
			{ mode: 0o600 },
		);
		await rm(stale, { recursive: true });

		const result = runHelper(checkout);

		expect(result).toMatchObject({ status: 0 });
		expect(git(repo.main, ["worktree", "list", "--porcelain"])).toContain(
			"prunable",
		);
		const generated = await readWorktreeEnv(checkout);
		expect(generated.apiPort).toBe(18080 + expectedSlot);
		expect(generated.webPort).toBe(13000 + expectedSlot);
	});

	it("fails when live peer worktrees already have duplicate reservations", async () => {
		const repo = await createTempRepo();
		const checkoutA = addWorktree(repo, "checkout-a");
		const checkoutB = addWorktree(repo, "checkout-b");
		const checkoutC = addWorktree(repo, "checkout-c");
		const duplicateEnv = generatedWorktreeEnv(37);
		const envPathA = path.join(checkoutA, ".env.worktree");
		const envPathB = path.join(checkoutB, ".env.worktree");
		const currentEnvPath = path.join(checkoutC, ".env.worktree");
		await writeFile(envPathA, duplicateEnv, { mode: 0o600 });
		await writeFile(envPathB, duplicateEnv, { mode: 0o600 });

		const result = runHelper(checkoutC);

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain(envPathA);
		expect(result.stderr).toContain(envPathB);
		await expect(lstat(currentEnvPath)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("serializes concurrent helpers so colliding initial slots probe to distinct pairs", async () => {
		const repo = await createTempRepo();
		const sourceBefore = await readFile(path.join(repo.main, ".env.local"));
		const names = await findCollidingWorktreeNames(repo);
		const checkoutA = addWorktree(repo, names.first);
		const checkoutB = addWorktree(repo, names.second);

		const [resultA, resultB] = await Promise.all([
			runHelperAsync(checkoutA),
			runHelperAsync(checkoutB),
		]);

		expect(resultA).toMatchObject({ status: 0 });
		expect(resultB).toMatchObject({ status: 0 });
		await expectRegularPrivateFile(path.join(checkoutA, ".env.worktree"));
		await expectRegularPrivateFile(path.join(checkoutB, ".env.worktree"));
		const envA = await readWorktreeEnv(checkoutA);
		const envB = await readWorktreeEnv(checkoutB);
		const expectedApiPorts = [
			18080 + names.slot,
			18080 + ((names.slot + 1) % 1000),
		].sort((left, right) => left - right);
		expect(
			[envA.apiPort, envB.apiPort].sort((left, right) => left - right),
		).toEqual(expectedApiPorts);
		expect(envA.apiPort).not.toBe(envB.apiPort);
		expect(envA.webPort).not.toBe(envB.webPort);
		await expect(readFile(path.join(repo.main, ".env.local"))).resolves.toEqual(
			sourceBefore,
		);
	});

	it("fails closed for colliding, symlinked, and malformed assignments without rewriting them", async () => {
		const repo = await createTempRepo();
		const checkoutA = addWorktree(repo, "checkout-a");
		const checkoutB = addWorktree(repo, "checkout-b");
		expect(runHelper(checkoutA)).toMatchObject({ status: 0 });
		expect(runHelper(checkoutB)).toMatchObject({ status: 0 });
		const assignmentA = await readFile(path.join(checkoutA, ".env.worktree"));
		const assignmentB = await readFile(path.join(checkoutB, ".env.worktree"));
		await writeFile(path.join(checkoutB, ".env.worktree"), assignmentA, {
			mode: 0o600,
		});

		const collision = runHelper(checkoutB);

		expect(collision.status).not.toBe(0);
		expect(collision.stderr).toContain(path.join(checkoutA, ".env.worktree"));
		expect(collision.stderr).toContain(path.join(checkoutB, ".env.worktree"));
		await expect(
			readFile(path.join(checkoutB, ".env.worktree")),
		).resolves.toEqual(assignmentA);
		await writeFile(path.join(checkoutB, ".env.worktree"), assignmentB, {
			mode: 0o600,
		});

		const symlinked = addWorktree(repo, "symlinked");
		const symlinkTarget = path.join(repo.root, "symlink-target.env");
		await writeFile(symlinkTarget, "API_PORT=18081\n", { mode: 0o600 });
		execFileSync("ln", [
			"-s",
			symlinkTarget,
			path.join(symlinked, ".env.worktree"),
		]);
		const symlinkResult = runHelper(symlinked);
		expect(symlinkResult.status).not.toBe(0);
		expect(symlinkResult.stderr).toContain(
			path.join(symlinked, ".env.worktree"),
		);
		await expect(readFile(symlinkTarget, "utf8")).resolves.toBe(
			"API_PORT=18081\n",
		);

		const malformed = addWorktree(repo, "malformed");
		const malformedPath = path.join(malformed, ".env.worktree");
		await writeFile(
			malformedPath,
			[
				"# Generated by make worktree-env. Do not edit.",
				"API_PORT=018081",
				"WEB_PORT=13001",
				"PUBLIC_WEB_BASE_URL=http://localhost:13001",
				"",
			].join("\n"),
			{ mode: 0o600 },
		);
		const malformedBytes = await readFile(malformedPath);
		const malformedResult = runHelper(malformed);
		expect(malformedResult.status).not.toBe(0);
		expect(malformedResult.stderr).toContain(malformedPath);
		await expect(readFile(malformedPath)).resolves.toEqual(malformedBytes);
	});

	it("fails closed without repairing an existing generated env with public permissions", async () => {
		const repo = await createTempRepo();
		const checkout = addWorktree(repo, "checkout-a");
		const envPath = path.join(checkout, ".env.worktree");
		const envBytes = generatedWorktreeEnv(await expectedSlotForPath(checkout));
		await writeFile(envPath, envBytes, { mode: 0o644 });

		const result = runHelper(checkout);

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain(envPath);
		await expect(readFile(envPath, "utf8")).resolves.toBe(envBytes);
		const fileStat = await lstat(envPath);
		expect((fileStat.mode & 0o777).toString(8)).toBe("644");
	});
});
