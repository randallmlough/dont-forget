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

module.exports = {
	dynamicImportSource,
	filenameFromContext,
	importSource,
	isAppApiFile,
	isTestFile,
	normalizePath,
};
