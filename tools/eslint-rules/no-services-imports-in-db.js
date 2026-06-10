const {
	dynamicImportSource,
	filenameFromContext,
	importSource,
	isTestFile,
	normalizePath,
} = require("./path-utils");
const path = require("node:path");

module.exports = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Keep the db layer at the bottom: db/ must not import service or API layers.",
		},
		messages: {
			noUpwardImport:
				"The db layer must not import from lib/services or lib/api. Keep db/ self-contained; service-layer vocabulary that depends on db types imports downward from @/db instead. See ADR-0014.",
		},
		schema: [],
	},
	create(context) {
		const filename = filenameFromContext(context);
		if (!isDbFile(filename) || isTestFile(filename)) return {};

		function check(node, source) {
			if (!source || !isUpwardImport(source, filename)) return;
			context.report({ node, messageId: "noUpwardImport" });
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

function isDbFile(filename) {
	return /\/db\//.test(filename) && !/\/node_modules\//.test(filename);
}

function isUpwardImport(source, filename) {
	if (/^@\/lib\/(?:services|api)(?:\/.*)?$/.test(source)) {
		return true;
	}
	if (!source.startsWith(".")) return false;

	const resolved = normalizePath(
		path.posix.normalize(path.posix.join(path.posix.dirname(filename), source)),
	);
	return /\/lib\/(?:services|api)(?:\/|$)/.test(resolved);
}
