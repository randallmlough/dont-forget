const path = require("node:path");

module.exports = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow useEffect directly in screen implementation files.",
		},
		messages: {
			moveToHook:
				"Move screen effects into a route-owned hook or container. Screen files should render explicit state/actions. See docs/code-standards/react.md.",
		},
		schema: [],
	},
	create(context) {
		const filename = context.filename ?? context.getFilename();
		if (!isScreenImplementationFile(filename)) {
			return {};
		}

		return {
			CallExpression(node) {
				if (!isUseEffectCall(node)) return;
				context.report({ node, messageId: "moveToHook" });
			},
		};
	},
};

function isScreenImplementationFile(filename) {
	const normalized = filename.split(path.sep).join("/");
	if (!normalized.includes("/screens/")) return false;
	if (/\/use-[^/]+\.tsx?$/.test(normalized)) return false;
	if (/\.hook\.tsx?$/.test(normalized)) return false;
	if (/\.test\.tsx?$/.test(normalized)) return false;
	if (/\.stories\.tsx?$/.test(normalized)) return false;
	return /\.tsx?$/.test(normalized);
}

function isUseEffectCall(node) {
	return node.callee?.type === "Identifier" && node.callee.name === "useEffect";
}
