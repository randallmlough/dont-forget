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

const API_RUNTIME_PACKAGE_ROOTS = new Set([
	"@clerk/backend",
	"@clerk/shared",
	"@hono/node-server",
	"@posthog/core",
	"dotenv",
	"drizzle-orm",
	"hono",
	"pg",
	"pg-cloudflare",
	"pg-connection-string",
	"pg-int8",
	"pg-pool",
	"pg-protocol",
	"pg-types",
	"pgpass",
	"postgres-array",
	"postgres-bytea",
	"postgres-date",
	"postgres-interval",
	"posthog-node",
	"split2",
	"xtend",
	"zod",
]);

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
	if (
		normalizedInput.startsWith("src/server/") ||
		normalizedInput.startsWith("src/shared/")
	) {
		return;
	}

	const packageRoot = nodeModulesPackageRoot(normalizedInput);
	if (packageRoot && API_RUNTIME_PACKAGE_ROOTS.has(packageRoot)) return;
	if (packageRoot) {
		throw new Error(
			`Unexpected API runtime package ${packageRoot}: ${inputPath}`,
		);
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

function nodeModulesPackageRoot(inputPath: string): string | undefined {
	const segments = `/${inputPath}`.split("/node_modules/");
	if (segments.length === 1) return undefined;

	const dependencyPath = segments[segments.length - 1];
	if (!dependencyPath) return undefined;

	const [root, scopedName] = dependencyPath.split("/");
	if (!root) return undefined;
	if (!root.startsWith("@")) return root;
	return scopedName ? `${root}/${scopedName}` : undefined;
}

function normalizePath(path: string): string {
	return path.replaceAll("\\", "/");
}
