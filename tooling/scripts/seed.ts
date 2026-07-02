import { seedLocalDatabases } from "@/server/db/seed";

seedLocalDatabases().catch((error) => {
	console.error(error);
	process.exit(1);
});
