import { reseedLocalDatabases } from "@/server/db/reseed";

reseedLocalDatabases().catch((error) => {
	console.error(error);
	process.exit(1);
});
