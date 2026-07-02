const path = require("node:path");
const {
	dynamicImportSource,
	filenameFromContext,
	importSource,
	isAppApiFile,
	isInsideFunction,
	isTestFile,
	normalizePath,
} = require("./path-utils");

module.exports = {
	meta: {
		type: "problem",
		docs: {
			description: "Enforce the server-only lib/api route boundary.",
		},
		messages: {
			appFacing:
				"App-facing code must not import lib/api. API handlers are server-only and may be used by app/api wrappers or tests.",
			apiStatic:
				"Expo API route files must lazy-load lib/api handlers inside request handlers instead of statically importing them.",
		},
		schema: [],
	},
	create(context) {
		const filename = filenameFromContext(context);

		function checkStaticImport(node) {
			const source = importSource(node);
			if (!source || !isLibApiImport(source, filename)) return;
			if (canUseLibApiImport(filename, { dynamic: false })) return;
			reportLibApiImport(context, filename, node);
		}

		return {
			ImportDeclaration: checkStaticImport,
			ExportAllDeclaration: checkStaticImport,
			ExportNamedDeclaration: checkStaticImport,
			ImportExpression(node) {
				const source = dynamicImportSource(node);
				if (!source || !isLibApiImport(source, filename)) return;
				if (
					canUseLibApiImport(filename, {
						dynamic: true,
						insideFunction: isInsideFunction(node),
					})
				) {
					return;
				}
				reportLibApiImport(context, filename, node);
			},
		};
	},
};

function reportLibApiImport(context, filename, node) {
	if (isAppApiFile(filename)) {
		context.report({ node, messageId: "apiStatic" });
		return;
	}

	context.report({ node, messageId: "appFacing" });
}

function canUseLibApiImport(filename, { dynamic, insideFunction = false }) {
	if (isTestFile(filename)) return true;
	if (isLibApiFile(filename)) return true;
	return dynamic && insideFunction && isAppApiFile(filename);
}

function isLibApiImport(source, filename) {
	if (source === "@/lib/api" || source.startsWith("@/lib/api/")) {
		return true;
	}
	if (!source.startsWith(".")) return false;

	const resolved = normalizePath(
		path.posix.normalize(path.posix.join(path.posix.dirname(filename), source)),
	);
	return /\/lib\/api(?:\/|$)/.test(resolved);
}

function isLibApiFile(filename) {
	return /\/lib\/api\//.test(filename);
}
