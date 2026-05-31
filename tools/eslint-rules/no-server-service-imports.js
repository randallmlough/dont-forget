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
				"Enforce domain-first service runtime boundaries for server services.",
		},
		messages: {
			appSafeIndex:
				"App-safe service indexes must not import or export server services. Export server APIs from lib/services/<domain>/server/index.ts instead. See docs/how-things-work/services.md.",
			appFacing:
				"App-facing code must not import server services. Put server-only code under lib/services/<domain>/server and lazy-load it from app/api handlers. See docs/how-things-work/services.md.",
			apiStatic:
				"Expo API routes must lazy-load server services inside request handlers instead of statically importing them. See docs/how-things-work/services.md.",
		},
		schema: [],
	},
	create(context) {
		const filename = filenameFromContext(context);

		function checkStaticImport(node) {
			const source = importSource(node);
			if (!source || !isServerServiceImport(source, filename)) return;
			if (canUseServerServiceImport(filename, { dynamic: false })) return;
			reportServerImport(context, filename, node);
		}

		return {
			ImportDeclaration: checkStaticImport,
			ExportAllDeclaration: checkStaticImport,
			ExportNamedDeclaration: checkStaticImport,
			ImportExpression(node) {
				const source = dynamicImportSource(node);
				if (!source || !isServerServiceImport(source, filename)) return;
				if (canUseServerServiceImport(filename, { dynamic: true })) return;
				reportServerImport(context, filename, node);
			},
		};
	},
};

function reportServerImport(context, filename, node) {
	if (isAppSafeDomainIndex(filename)) {
		context.report({ node, messageId: "appSafeIndex" });
		return;
	}

	if (isAppApiFile(filename)) {
		context.report({ node, messageId: "apiStatic" });
		return;
	}

	context.report({ node, messageId: "appFacing" });
}

function canUseServerServiceImport(filename, { dynamic }) {
	if (isTestFile(filename)) return true;
	if (isLibApiFile(filename)) return true;
	if (isServerServiceFile(filename)) return true;
	return dynamic && isAppApiFile(filename);
}

function isServerServiceImport(source, filename) {
	if (/^@\/lib\/services\/[^/]+\/server(?:\/.*)?$/.test(source)) {
		return true;
	}
	if (!source.startsWith(".")) return false;

	const resolved = normalizePath(
		path.posix.normalize(path.posix.join(path.posix.dirname(filename), source)),
	);
	return /\/lib\/services\/[^/]+\/server(?:\/|$)/.test(resolved);
}

function isServerServiceFile(filename) {
	return /\/lib\/services\/[^/]+\/server\//.test(filename);
}

function isLibApiFile(filename) {
	return /\/lib\/api\//.test(filename);
}

function isAppSafeDomainIndex(filename) {
	return /\/lib\/services\/[^/]+\/index\.ts$/.test(filename);
}
