import { resolve } from "node:path";
import { buildApiArtifact } from "./api-artifact";

async function main(): Promise<void> {
	await buildApiArtifact({
		projectRoot: process.cwd(),
		outputDirectory: resolve(process.cwd(), "dist"),
	});
}

void main().catch((error: unknown) => {
	console.error("API build failed", error);
	process.exitCode = 1;
});
