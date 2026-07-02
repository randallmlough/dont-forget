import { reseedLocalDatabases } from "@/db/server/reseed";

reseedLocalDatabases().catch((error) => {
	console.error(error);
	process.exit(1);
});
