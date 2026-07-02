const noClientServerImports = require("./no-client-server-imports");
const noRawColorLiterals = require("./no-raw-color-literals");

module.exports = {
	rules: {
		"no-client-server-imports": noClientServerImports,
		"no-raw-color-literals": noRawColorLiterals,
	},
};
