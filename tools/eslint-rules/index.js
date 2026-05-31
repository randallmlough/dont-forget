const noScreenUseEffect = require("./no-screen-use-effect");
const noServerServiceImports = require("./no-server-service-imports");
const noDbImportsOutsideServices = require("./no-db-imports-outside-services");
const noLibApiImports = require("./no-lib-api-imports");

module.exports = {
	rules: {
		"no-db-imports-outside-services": noDbImportsOutsideServices,
		"no-lib-api-imports": noLibApiImports,
		"no-screen-use-effect": noScreenUseEffect,
		"no-server-service-imports": noServerServiceImports,
	},
};
