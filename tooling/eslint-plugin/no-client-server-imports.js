const {
	dynamicImportSource,
	filenameFromContext,
	importSource,
	isAppApiFile,
	isTestFile,
} = require("./path-utils");

module.exports = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Client code must not import server code. src/client and src/app (except src/app/api routes) may not import from src/server.",
		},
		messages: {
			noServerImport:
				"Client code must not import src/server modules. Call the API via src/client feature api wrappers, or move shared code to src/shared.",
		},
		schema: [],
	},
	create(context) {
		const filename = filenameFromContext(context);
		if (!isClientFile(filename)) return {};

		function check(node, source) {
			if (!source || !isServerImport(source)) return;
			context.report({ node, messageId: "noServerImport" });
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

function isClientFile(filename) {
	if (!/\.[jt]sx?$/.test(filename)) return false;
	if (isTestFile(filename)) return false;
	if (isAppApiFile(filename)) return false;
	return /\/src\/(?:client|app)\//.test(filename);
}

function isServerImport(source) {
	return source === "@/server" || source.startsWith("@/server/");
}
