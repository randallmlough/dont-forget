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
				"Disallow direct database library imports from app-facing code.",
		},
		messages: {
			useServices:
				"App-facing code must not import database libraries or DB clients directly. Query and mutate data through domain services under lib/services/<domain> instead. See docs/how-things-work/services.md.",
		},
		schema: [],
	},
	create(context) {
		const filename = filenameFromContext(context);
		if (!isAppFacingFile(filename)) return {};

		function check(node, source) {
			if (!source || !isDatabaseImport(source)) return;
			context.report({ node, messageId: "useServices" });
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

function isAppFacingFile(filename) {
	if (!/\.tsx?$/.test(filename)) return false;
	if (isTestFile(filename)) return false;
	if (isAppApiFile(filename)) return false;
	return (
		/\/app\//.test(filename) ||
		/\/screens\//.test(filename) ||
		/\/components\//.test(filename)
	);
}

function isDatabaseImport(source) {
	return (
		source === "drizzle-orm" ||
		source.startsWith("drizzle-orm/") ||
		source === "@electric-sql/pglite" ||
		source.startsWith("@electric-sql/pglite/") ||
		source === "pg" ||
		source === "@op-engineering/op-sqlite" ||
		source.startsWith("@op-engineering/op-sqlite/") ||
		source.startsWith("@powersync/") ||
		source === "@/db/client" ||
		source.startsWith("@/db/")
	);
}
