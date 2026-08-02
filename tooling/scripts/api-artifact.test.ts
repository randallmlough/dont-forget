import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Metafile } from "esbuild";
import {
	API_BUNDLE_BANNER,
	buildApiArtifact,
	verifyApiArtifact,
} from "./api-artifact";

describe("API artifact", () => {
	let temporaryRoot: string;

	beforeEach(async () => {
		temporaryRoot = await mkdtemp(join(tmpdir(), "dont-forget-api-artifact-"));
	});

	afterEach(async () => {
		await rm(temporaryRoot, { recursive: true });
	});

	it("builds and verifies the real Node 22 ESM bundle in isolation", async () => {
		const outputDirectory = join(temporaryRoot, "dist");

		await buildApiArtifact({
			projectRoot: process.cwd(),
			outputDirectory,
		});

		await expect(
			verifyApiArtifact({
				projectRoot: process.cwd(),
				bundlePath: join(outputDirectory, "main.mjs"),
				metafilePath: join(outputDirectory, "main.meta.json"),
			}),
		).resolves.toBeUndefined();
	});

	it("rejects app-owned inputs outside server and shared", async () => {
		const fixture = await writeArtifactFixture({
			inputs: {
				"src/server/main.ts": input(),
				"src/client/private.ts": input(),
			},
		});

		await expect(verifyApiArtifact(fixture)).rejects.toThrow(
			"src/client/private.ts",
		);
	});

	it("rejects Expo and mobile runtime inputs", async () => {
		const fixture = await writeArtifactFixture({
			inputs: {
				"src/server/main.ts": input(),
				"node_modules/expo/build/Expo.fx.js": input(),
			},
		});

		await expect(verifyApiArtifact(fixture)).rejects.toThrow(
			"node_modules/expo/build/Expo.fx.js",
		);
	});

	it.each([
		"node_modules/@tanstack/react-start/dist/index.js",
		"node_modules/vite/dist/node/index.js",
		"node_modules/@clerk/backend/node_modules/react/index.js",
	])("rejects forbidden frontend package input %s", async (inputPath) => {
		const fixture = await writeArtifactFixture({
			inputs: {
				"src/server/main.ts": input(),
				[inputPath]: input(),
			},
		});

		await expect(verifyApiArtifact(fixture)).rejects.toThrow(inputPath);
	});

	it("accepts an allowlisted scoped package from a nested node_modules path", async () => {
		const fixture = await writeArtifactFixture({
			inputs: {
				"src/server/main.ts": input(),
				"node_modules/.pnpm/@clerk+shared@1.0.0/node_modules/@clerk/shared/dist/index.js":
					input(),
			},
		});

		await expect(verifyApiArtifact(fixture)).resolves.toBeUndefined();
	});

	it("rejects non-built-in external imports", async () => {
		const fixture = await writeArtifactFixture({
			externalImports: ["left-pad"],
		});

		await expect(verifyApiArtifact(fixture)).rejects.toThrow("left-pad");
	});

	it("rejects a bundle without the required createRequire banner", async () => {
		const fixture = await writeArtifactFixture({ bundle: "export {};\n" });

		await expect(verifyApiArtifact(fixture)).rejects.toThrow(
			"createRequire banner",
		);
	});

	async function writeArtifactFixture({
		bundle = `${API_BUNDLE_BANNER}\nexport {};\n`,
		inputs = { "src/server/main.ts": input() },
		externalImports = ["node:fs", "pg-native"],
	}: {
		bundle?: string;
		inputs?: Metafile["inputs"];
		externalImports?: string[];
	}): Promise<Parameters<typeof verifyApiArtifact>[0]> {
		const bundlePath = join(temporaryRoot, "dist/main.mjs");
		const metafilePath = join(temporaryRoot, "dist/main.meta.json");
		const imports: Metafile["outputs"][string]["imports"] = externalImports.map(
			(path) => ({
				path,
				kind: "import-statement",
				external: true,
			}),
		);
		await mkdir(join(temporaryRoot, "dist"), { recursive: true });
		await writeFile(bundlePath, bundle);
		const metafile = {
			inputs,
			outputs: {
				"dist/main.mjs": {
					imports,
					exports: [],
					entryPoint: "src/server/main.ts",
					inputs: { "src/server/main.ts": { bytesInOutput: 1 } },
					bytes: bundle.length,
				},
			},
		} satisfies Metafile;
		await writeFile(metafilePath, JSON.stringify(metafile));

		return {
			projectRoot: temporaryRoot,
			bundlePath,
			metafilePath,
		};
	}
});

function input(): Metafile["inputs"][string] {
	return { bytes: 1, imports: [], format: "esm" };
}
