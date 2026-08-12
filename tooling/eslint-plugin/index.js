const packageBoundaries = require("./package-boundaries");
const noRawColorLiterals = require("./no-raw-color-literals");

module.exports = {
	rules: {
		"package-boundaries": packageBoundaries,
		"no-raw-color-literals": noRawColorLiterals,
	},
};
