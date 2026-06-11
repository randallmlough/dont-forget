const noScreenUseEffect = require("./no-screen-use-effect");
const noServerServiceImports = require("./no-server-service-imports");
const noDbImportsOutsideServices = require("./no-db-imports-outside-services");
const noDbServerImports = require("./no-db-server-imports");
const noLibApiImports = require("./no-lib-api-imports");
const noServicesImportsInDb = require("./no-services-imports-in-db");

module.exports = {
	rules: {
		"no-db-imports-outside-services": noDbImportsOutsideServices,
		"no-db-server-imports": noDbServerImports,
		"no-lib-api-imports": noLibApiImports,
		"no-services-imports-in-db": noServicesImportsInDb,
		"no-screen-use-effect": noScreenUseEffect,
		"no-server-service-imports": noServerServiceImports,
	},
};
