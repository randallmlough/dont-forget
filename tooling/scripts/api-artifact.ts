import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { build } from "esbuild";
import { z } from "zod";

export const API_BUNDLE_BANNER = `import { createRequire } from "node:module";
const require = createRequire(import.meta.url);`;

export interface BuildApiArtifactOptions {
	projectRoot: string;
	outputDirectory: string;
}

export interface VerifyApiArtifactOptions {
	projectRoot: string;
	bundlePath: string;
	metafilePath: string;
}

const metafileSchema = z.object({
	inputs: z.record(z.string(), z.unknown()),
	outputs: z.record(
		z.string(),
		z.object({
			entryPoint: z.string().optional(),
			imports: z.array(
				z.object({
					external: z.boolean().optional(),
					path: z.string(),
				}),
			),
		}),
	),
});

export async function buildApiArtifact({
	projectRoot,
	outputDirectory,
}: BuildApiArtifactOptions): Promise<void> {
	const bundlePath = resolve(outputDirectory, "main.mjs");
	const metafilePath = resolve(outputDirectory, "main.meta.json");
	await mkdir(outputDirectory, { recursive: true });

	const result = await build({
		absWorkingDir: projectRoot,
		banner: { js: API_BUNDLE_BANNER },
		bundle: true,
		entryPoints: ["src/server/main.ts"],
		external: ["pg-native"],
		format: "esm",
		logLevel: "info",
		metafile: true,
		outfile: bundlePath,
		platform: "node",
		target: "node22",
		tsconfig: "tsconfig.json",
	});

	await writeFile(metafilePath, JSON.stringify(result.metafile, null, 2));
	await verifyApiArtifact({ projectRoot, bundlePath, metafilePath });
}

export async function verifyApiArtifact({
	projectRoot,
	bundlePath,
	metafilePath,
}: VerifyApiArtifactOptions): Promise<void> {
	const [bundle, rawMetafile] = await Promise.all([
		readFile(bundlePath, "utf8"),
		readFile(metafilePath, "utf8"),
	]);
	const metafile = metafileSchema.parse(JSON.parse(rawMetafile));

	if (!bundle.startsWith(API_BUNDLE_BANNER)) {
		throw new Error("API bundle is missing the required createRequire banner");
	}

	const outputs = Object.entries(metafile.outputs);
	if (outputs.length !== 1) {
		throw new Error(
			`Expected exactly one API bundle output, found ${outputs.length}`,
		);
	}

	const [outputPath, output] = outputs[0];
	if (resolve(projectRoot, outputPath) !== resolve(bundlePath)) {
		throw new Error(`Unexpected API bundle output: ${outputPath}`);
	}
	if (!outputPath.endsWith(".mjs")) {
		throw new Error(`API bundle output must use .mjs: ${outputPath}`);
	}
	if (normalizePath(output.entryPoint ?? "") !== "src/server/main.ts") {
		throw new Error(
			`Unexpected API entry point: ${output.entryPoint ?? "missing"}`,
		);
	}

	for (const inputPath of Object.keys(metafile.inputs)) {
		verifyInputPath(projectRoot, inputPath);
	}

	for (const imported of output.imports) {
		if (
			imported.external === true &&
			imported.path !== "pg-native" &&
			!isBuiltin(imported.path)
		) {
			throw new Error(`Unexpected external API import: ${imported.path}`);
		}
	}
}

function verifyInputPath(projectRoot: string, inputPath: string): void {
	const normalizedInput = normalizeProjectInput(projectRoot, inputPath);
	if (isMobileRuntimeInput(normalizedInput)) {
		throw new Error(`Mobile runtime leaked into API bundle: ${inputPath}`);
	}
	if (
		normalizedInput.startsWith("node_modules/") ||
		normalizedInput.startsWith("src/server/") ||
		normalizedInput.startsWith("src/shared/")
	) {
		return;
	}

	throw new Error(`Unexpected app-owned API input: ${inputPath}`);
}

function normalizeProjectInput(projectRoot: string, inputPath: string): string {
	if (!isAbsolute(inputPath)) {
		return normalizePath(inputPath);
	}

	const relativeInput = relative(resolve(projectRoot), resolve(inputPath));
	if (relativeInput === ".." || relativeInput.startsWith(`..${sep}`)) {
		throw new Error(`API input is outside the project root: ${inputPath}`);
	}
	return normalizePath(relativeInput);
}

function isMobileRuntimeInput(inputPath: string): boolean {
	const dependencyPaths = `/${inputPath}`.split("/node_modules/").slice(1);
	return dependencyPaths.some((dependencyPath) => {
		return (
			dependencyPath === "expo" ||
			dependencyPath.startsWith("expo/") ||
			dependencyPath.startsWith("expo-") ||
			dependencyPath.startsWith("@expo/") ||
			dependencyPath === "react-native" ||
			dependencyPath.startsWith("react-native/") ||
			dependencyPath.startsWith("@react-native/") ||
			dependencyPath === "react-dom" ||
			dependencyPath.startsWith("react-dom/") ||
			dependencyPath === "react-native-web" ||
			dependencyPath.startsWith("react-native-web/")
		);
	});
}

function normalizePath(path: string): string {
	return path.replaceAll("\\", "/");
}
