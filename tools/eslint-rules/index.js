const noScreenUseEffect = require("./no-screen-use-effect");
const noServerServiceImports = require("./no-server-service-imports");
const noDbImportsOutsideServices = require("./no-db-imports-outside-services");

module.exports = {
	rules: {
		"no-db-imports-outside-services": noDbImportsOutsideServices,
		"no-screen-use-effect": noScreenUseEffect,
		"no-server-service-imports": noServerServiceImports,
	},
};
