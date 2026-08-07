import { formatSeedCliError, seedDatabases } from "../src/seed";

seedDatabases().catch((error) => {
	console.error(formatSeedCliError(error));
	process.exit(1);
});
