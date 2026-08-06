import { seedLocalDatabases } from "../src/seed";

seedLocalDatabases().catch((error) => {
	console.error(error);
	process.exit(1);
});
