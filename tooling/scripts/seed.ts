import { seedLocalDatabases } from "@/db/server/seed";

seedLocalDatabases().catch((error) => {
	console.error(error);
	process.exit(1);
});
