const { existsSync, readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");
const { parse: parseYaml } = require("yaml");

const {
	dynamicImportSource,
	filenameFromContext,
	importSource,
} = require("./path-utils");

const workspaceCache = new Map();

module.exports = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Enforce workspace package boundaries, declarations, and exports.",
		},
		messages: {
			crossPackageAlias:
				'Alias import "{{ source }}" reaches source owned by {{ packageName }}.',
			devOnlyWorkspacePackage:
				'Workspace package "{{ targetName }}" is a dev dependency of {{ packageName }} and cannot be imported by production source.',
			escapingAliasTarget:
				'Alias import "{{ source }}" resolves outside the {{ packageName }} package.',
			relativeEscape:
				'Relative import "{{ source }}" escapes the {{ packageName }} package.',
			undeclaredWorkspacePackage:
				'Workspace package "{{ targetName }}" is not declared by {{ packageName }}.',
			unexportedWorkspaceSubpath:
				'Workspace import "{{ source }}" is not exported by {{ targetName }}.',
		},
		schema: [],
	},
	create(context) {
		const filename = filenameFromContext(context);
		const packageRoot = nearestPackageRoot(filename);
		const repositoryRoot = packageRoot && nearestRepositoryRoot(packageRoot);
		if (!packageRoot || !repositoryRoot) return {};

		const workspace = loadWorkspace(repositoryRoot);
		const importer = workspace.byRoot.get(packageRoot);
		if (!importer) return {};
		const toolingImporter = isToolingImporter(filename, importer);

		function check(node, source) {
			if (!source) return;

			if (source.startsWith(".")) {
				const target = path.resolve(path.dirname(filename), source);
				if (!isWithin(importer.root, target)) {
					context.report({
						node,
						messageId: "relativeEscape",
						data: { source, packageName: importer.name },
					});
				}
				return;
			}

			const matchingAliases = workspace.aliases.filter(({ pattern }) =>
				matchesPattern(pattern, source),
			);
			const ownedAlias = matchingAliases.find(
				(alias) => alias.packageRoot === importer.root,
			);
			if (ownedAlias) {
				if (
					ownedAlias.targets.some(
						(target) =>
							!isWithin(
								importer.root,
								resolveAliasTarget(ownedAlias, target, source),
							),
					)
				) {
					context.report({
						node,
						messageId: "escapingAliasTarget",
						data: { source, packageName: importer.name },
					});
				}
				return;
			}
			const foreignAlias = matchingAliases[0];
			if (foreignAlias) {
				context.report({
					node,
					messageId: "crossPackageAlias",
					data: { source, packageName: foreignAlias.packageName },
				});
				return;
			}

			const target = workspace.packages.find(
				(candidate) =>
					source === candidate.name || source.startsWith(`${candidate.name}/`),
			);
			if (!target) return;

			if (target.root !== importer.root) {
				const declaration = dependencyDeclaration(
					importer.manifest,
					target.name,
				);
				if (declaration === "missing") {
					context.report({
						node,
						messageId: "undeclaredWorkspacePackage",
						data: { packageName: importer.name, targetName: target.name },
					});
					return;
				}
				if (declaration === "dev" && !toolingImporter) {
					context.report({
						node,
						messageId: "devOnlyWorkspacePackage",
						data: { packageName: importer.name, targetName: target.name },
					});
					return;
				}
			}

			const subpath =
				source === target.name ? "." : `.${source.slice(target.name.length)}`;
			if (!isExported(target.manifest.exports, subpath)) {
				context.report({
					node,
					messageId: "unexportedWorkspaceSubpath",
					data: { source, targetName: target.name },
				});
			}
		}

		return {
			ImportDeclaration(node) {
				check(node, importSource(node));
			},
			ExportAllDeclaration(node) {
				check(node, importSource(node));
			},
			ExportNamedDeclaration(node) {
				check(node, importSource(node));
			},
			ImportExpression(node) {
				check(node, dynamicImportSource(node));
			},
		};
	},
};

function nearestPackageRoot(filename) {
	let current = path.dirname(filename);
	for (;;) {
		if (existsSync(path.join(current, "package.json"))) return current;
		const parent = path.dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

function nearestRepositoryRoot(packageRoot) {
	let current = packageRoot;
	for (;;) {
		if (existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
		const parent = path.dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

function loadWorkspace(repositoryRoot) {
	const cached = workspaceCache.get(repositoryRoot);
	if (cached) return cached;

	const packageRoots = workspacePackageRoots(repositoryRoot);
	const packages = packageRoots.map((root) => ({
		root,
		manifest: readJson(path.join(root, "package.json")),
	}));
	const packageRecords = packages
		.filter(({ manifest }) => typeof manifest.name === "string")
		.map(({ root, manifest }) => ({
			root,
			manifest,
			name: manifest.name,
		}));
	const aliases = packageRecords.flatMap((packageRecord) =>
		readPathAliases(packageRecord),
	);
	const workspace = {
		aliases,
		packages: packageRecords,
		byRoot: new Map(packageRecords.map((entry) => [entry.root, entry])),
	};
	workspaceCache.set(repositoryRoot, workspace);
	return workspace;
}

function workspacePackageRoots(repositoryRoot) {
	const workspaceFile = path.join(repositoryRoot, "pnpm-workspace.yaml");
	const config = parseYaml(readFileSync(workspaceFile, "utf8"));
	const patterns = Array.isArray(config?.packages) ? config.packages : [];
	const roots = new Set();
	for (const pattern of patterns) {
		if (typeof pattern !== "string" || pattern.startsWith("!")) continue;
		for (const root of expandWorkspacePattern(repositoryRoot, pattern)) {
			if (existsSync(path.join(root, "package.json"))) roots.add(root);
		}
	}
	for (const pattern of patterns) {
		if (typeof pattern !== "string" || !pattern.startsWith("!")) continue;
		for (const root of expandWorkspacePattern(
			repositoryRoot,
			pattern.slice(1),
		)) {
			roots.delete(root);
		}
	}
	return [...roots];
}

function expandWorkspacePattern(repositoryRoot, pattern) {
	const segments = pattern
		.replaceAll("\\", "/")
		.split("/")
		.filter((segment) => segment && segment !== ".");
	return expandDirectorySegments(repositoryRoot, segments, 0).filter((root) =>
		isWithin(repositoryRoot, root),
	);
}

function expandDirectorySegments(current, segments, index) {
	if (index === segments.length) return [current];
	const segment = segments[index];
	if (segment === "**") {
		return [
			...expandDirectorySegments(current, segments, index + 1),
			...childDirectories(current).flatMap((child) =>
				expandDirectorySegments(child, segments, index),
			),
		];
	}
	if (!segment.includes("*") && !segment.includes("?")) {
		const child = path.join(current, segment);
		return existsSync(child)
			? expandDirectorySegments(child, segments, index + 1)
			: [];
	}
	const matcher = globSegmentRegExp(segment);
	return childDirectories(current)
		.filter((child) => matcher.test(path.basename(child)))
		.flatMap((child) => expandDirectorySegments(child, segments, index + 1));
}

function childDirectories(parent) {
	if (!existsSync(parent)) return [];
	return readdirSync(parent, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isDirectory() &&
				entry.name !== "node_modules" &&
				entry.name !== ".git",
		)
		.map((entry) => path.join(parent, entry.name));
}

function globSegmentRegExp(segment) {
	const source = [...segment]
		.map((character) => {
			if (character === "*") return ".*";
			if (character === "?") return ".";
			return character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
		})
		.join("");
	return new RegExp(`^${source}$`);
}

function readPathAliases(packageRecord) {
	const tsconfigPath = path.join(packageRecord.root, "tsconfig.json");
	if (!existsSync(tsconfigPath)) return [];
	const compilerOptions = readJson(tsconfigPath).compilerOptions ?? {};
	const paths = compilerOptions.paths ?? {};
	const targetBase = path.resolve(
		packageRecord.root,
		compilerOptions.baseUrl ?? ".",
	);
	return Object.entries(paths).flatMap(([pattern, targets]) =>
		Array.isArray(targets) &&
		targets.every((target) => typeof target === "string")
			? [
					{
						pattern,
						targets,
						targetBase,
						packageName: packageRecord.name,
						packageRoot: packageRecord.root,
					},
				]
			: [],
	);
}

function resolveAliasTarget(alias, targetPattern, source) {
	const star = alias.pattern.indexOf("*");
	const wildcard =
		star === -1
			? ""
			: source.slice(star, source.length - (alias.pattern.length - star - 1));
	const target = targetPattern.replace("*", wildcard);
	return path.resolve(alias.targetBase, target);
}

function readJson(filename) {
	return JSON.parse(readFileSync(filename, "utf8"));
}

function matchesPattern(pattern, source) {
	const star = pattern.indexOf("*");
	if (star === -1) return pattern === source;
	return (
		source.startsWith(pattern.slice(0, star)) &&
		source.endsWith(pattern.slice(star + 1))
	);
}

function isWithin(root, target) {
	const relative = path.relative(root, target);
	return relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

function dependencyDeclaration(manifest, packageName) {
	if (
		[
			manifest.dependencies,
			manifest.optionalDependencies,
			manifest.peerDependencies,
		].some((dependencies) => dependencies?.[packageName] !== undefined)
	) {
		return "runtime";
	}
	if (manifest.devDependencies?.[packageName] !== undefined) return "dev";
	return "missing";
}

function isToolingImporter(filename, importer) {
	if (importer.name === "@dont-forget/tooling") return true;
	const relative = path
		.relative(importer.root, filename)
		.replaceAll(path.sep, "/");
	return (
		/(^|\/)(?:__tests__|test|tests|stories)(?:\/|$)/.test(relative) ||
		/\.(?:test|spec|stories)\.[cm]?[jt]sx?$/.test(relative) ||
		/(^|\/)(?:scripts|tooling|\.storybook|\.rnstorybook)(?:\/|$)/.test(
			relative,
		) ||
		/(^|\/)[^/]*config\.[cm]?[jt]sx?$/.test(relative)
	);
}

function isExported(exportsField, subpath) {
	if (typeof exportsField === "string") return subpath === ".";
	if (!exportsField || typeof exportsField !== "object") return false;
	return Object.keys(exportsField).some((pattern) =>
		matchesPattern(pattern, subpath),
	);
}
