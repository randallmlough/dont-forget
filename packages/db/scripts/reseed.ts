import { reseedLocalDatabases } from "../src/reseed";

reseedLocalDatabases().catch((error) => {
	console.error(error);
	process.exit(1);
});
