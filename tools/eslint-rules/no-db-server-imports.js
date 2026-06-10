const {
	dynamicImportSource,
	filenameFromContext,
	importSource,
	isAppApiFile,
	isTestFile,
	normalizePath,
} = require("./path-utils");
const path = require("node:path");

module.exports = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Restrict server-only db infrastructure imports to server-side code.",
		},
		messages: {
			serverOnly:
				"Only server-side code may import @/db/server. App-safe code uses @/db/household-store, @/db/schema, and @/db/utils; data access goes through domain services under lib/services/<domain>. See docs/how-things-work/services.md.",
			apiStatic:
				"Expo API routes must lazy-load @/db/server modules inside request handlers instead of statically importing them. See docs/how-things-work/services.md.",
		},
		schema: [],
	},
	create(context) {
		const filename = filenameFromContext(context);

		function checkStaticImport(node) {
			const source = importSource(node);
			if (!source || !isDbServerImport(source, filename)) return;
			if (canUseDbServerImport(filename, { dynamic: false })) return;
			reportDbServerImport(context, filename, node);
		}

		return {
			ImportDeclaration: checkStaticImport,
			ExportAllDeclaration: checkStaticImport,
			ExportNamedDeclaration: checkStaticImport,
			ImportExpression(node) {
				const source = dynamicImportSource(node);
				if (!source || !isDbServerImport(source, filename)) return;
				if (
					canUseDbServerImport(filename, {
						dynamic: true,
						insideFunction: isInsideFunction(node),
					})
				) {
					return;
				}
				reportDbServerImport(context, filename, node);
			},
		};
	},
};

function reportDbServerImport(context, filename, node) {
	if (isAppApiFile(filename)) {
		context.report({ node, messageId: "apiStatic" });
		return;
	}

	context.report({ node, messageId: "serverOnly" });
}

function canUseDbServerImport(filename, { dynamic, insideFunction = false }) {
	if (isTestFile(filename)) return true;
	if (isDbServerFile(filename)) return true;
	if (isServerServiceFile(filename)) return true;
	if (isLibApiFile(filename)) return true;
	if (isScriptFile(filename)) return true;
	return dynamic && insideFunction && isAppApiFile(filename);
}

function isDbServerImport(source, filename) {
	if (/^@\/db\/server(?:\/.*)?$/.test(source)) {
		return true;
	}
	if (!source.startsWith(".")) return false;

	const resolved = normalizePath(
		path.posix.normalize(path.posix.join(path.posix.dirname(filename), source)),
	);
	return /\/db\/server(?:\/|$)/.test(resolved);
}

function isDbServerFile(filename) {
	return /\/db\/server\//.test(filename);
}

function isServerServiceFile(filename) {
	return /\/lib\/services\/[^/]+\/server\//.test(filename);
}

function isLibApiFile(filename) {
	return /\/lib\/api\//.test(filename);
}

function isScriptFile(filename) {
	return /\/scripts\//.test(filename);
}

function isInsideFunction(node) {
	let current = node.parent;
	while (current) {
		if (
			current.type === "FunctionDeclaration" ||
			current.type === "FunctionExpression" ||
			current.type === "ArrowFunctionExpression"
		) {
			return true;
		}
		current = current.parent;
	}
	return false;
}
