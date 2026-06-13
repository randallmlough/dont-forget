const { filenameFromContext } = require("./path-utils");

const RAW_COLOR_PATTERN = /^#[0-9a-fA-F]{3,8}$|\b(?:rgb|rgba|hsl|hsla)\(/;

module.exports = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow raw color literals in app UI. Add colors to lib/unistyles/palette.ts and expose semantic theme tokens instead.",
		},
		messages: {
			rawColor:
				"Use Unistyles theme tokens instead of raw color literals. Raw color primitives belong in lib/unistyles/palette.ts.",
		},
		schema: [],
	},
	create(context) {
		const filename = filenameFromContext(context);
		if (!shouldCheckFile(filename)) return {};

		return {
			Literal(node) {
				if (typeof node.value !== "string") return;
				if (!RAW_COLOR_PATTERN.test(node.value)) return;
				context.report({ node, messageId: "rawColor" });
			},
			TemplateElement(node) {
				if (!RAW_COLOR_PATTERN.test(node.value.raw)) return;
				context.report({ node, messageId: "rawColor" });
			},
		};
	},
};

function shouldCheckFile(filename) {
	if (filename.endsWith("/lib/unistyles/palette.ts")) return false;
	return /\/(?:app|components|screens)\/.*\.[jt]sx?$/.test(filename);
}
