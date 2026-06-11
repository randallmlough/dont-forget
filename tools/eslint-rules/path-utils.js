const path = require("node:path");

function normalizePath(value) {
	return value.split(path.sep).join("/");
}

function filenameFromContext(context) {
	return normalizePath(context.filename ?? context.getFilename());
}

function importSource(node) {
	const source = node.source;
	return typeof source?.value === "string" ? source.value : null;
}

function dynamicImportSource(node) {
	const source = node.source;
	return source?.type === "Literal" && typeof source.value === "string"
		? source.value
		: null;
}

function isTestFile(filename) {
	return /\.(test|spec)\.tsx?$/.test(filename);
}

function isAppApiFile(filename) {
	return /\/app\/api\/.*\+api\.tsx?$/.test(filename);
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

module.exports = {
	dynamicImportSource,
	filenameFromContext,
	importSource,
	isAppApiFile,
	isInsideFunction,
	isTestFile,
	normalizePath,
};
