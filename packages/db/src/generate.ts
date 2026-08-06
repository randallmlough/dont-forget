import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const CONFIG_DIR = "src/drizzle";

async function main(): Promise<void> {
	const configs = await drizzleConfigs();

	if (configs.length === 0) {
		throw new Error(`No Drizzle config files found in ${CONFIG_DIR}`);
	}

	for (const config of configs) {
		await runDrizzleGenerate(config);
	}
}

async function drizzleConfigs(): Promise<string[]> {
	const entries = await readdir(path.join(process.cwd(), CONFIG_DIR));
	return entries
		.filter((entry) => entry.endsWith(".config.ts"))
		.sort()
		.map((entry) => path.join(CONFIG_DIR, entry));
}

async function runDrizzleGenerate(config: string): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn(
			"pnpm",
			["exec", "drizzle-kit", "generate", `--config=${config}`],
			{
				stdio: "inherit",
				shell: process.platform === "win32",
			},
		);

		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(
				new Error(
					`drizzle-kit generate failed for ${config} with exit code ${code}`,
				),
			);
		});
	});
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
