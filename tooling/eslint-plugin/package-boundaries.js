const { existsSync, readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");

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

			const aliasOwner = workspace.aliases.find(({ pattern }) =>
				matchesPattern(pattern, source),
			);
			if (aliasOwner) {
				if (aliasOwner.packageRoot !== importer.root) {
					context.report({
						node,
						messageId: "crossPackageAlias",
						data: { source, packageName: aliasOwner.packageName },
					});
				}
				return;
			}

			const target = workspace.packages.find(
				(candidate) =>
					source === candidate.name || source.startsWith(`${candidate.name}/`),
			);
			if (!target) return;

			if (
				target.root !== importer.root &&
				!declaresDependency(importer.manifest, target.name)
			) {
				context.report({
					node,
					messageId: "undeclaredWorkspacePackage",
					data: { packageName: importer.name, targetName: target.name },
				});
				return;
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

	const packageRoots = [
		...childDirectories(path.join(repositoryRoot, "apps")),
		...childDirectories(path.join(repositoryRoot, "packages")),
		path.join(repositoryRoot, "tooling"),
	].filter((root) => existsSync(path.join(root, "package.json")));
	const packages = packageRoots.map((root) => ({
		root,
		manifest: readJson(path.join(root, "package.json")),
	}));
	const packageRecords = packages.map(({ root, manifest }) => ({
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

function childDirectories(parent) {
	if (!existsSync(parent)) return [];
	return readdirSync(parent, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => path.join(parent, entry.name));
}

function readPathAliases(packageRecord) {
	const tsconfigPath = path.join(packageRecord.root, "tsconfig.json");
	if (!existsSync(tsconfigPath)) return [];
	const paths = readJson(tsconfigPath).compilerOptions?.paths ?? {};
	return Object.keys(paths).map((pattern) => ({
		pattern,
		packageName: packageRecord.name,
		packageRoot: packageRecord.root,
	}));
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

function declaresDependency(manifest, packageName) {
	return [
		manifest.dependencies,
		manifest.devDependencies,
		manifest.optionalDependencies,
		manifest.peerDependencies,
	].some((dependencies) => dependencies?.[packageName] !== undefined);
}

function isExported(exportsField, subpath) {
	if (typeof exportsField === "string") return subpath === ".";
	if (!exportsField || typeof exportsField !== "object") return false;
	return Object.keys(exportsField).some((pattern) =>
		matchesPattern(pattern, subpath),
	);
}
