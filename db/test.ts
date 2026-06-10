import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { type Client, createClient } from "@libsql/client/node";

import { directoryDb, householdDb } from "@/db/client";
import { DRIZZLE_MIGRATIONS_TABLE } from "@/db/utils";

const DIRECTORY_MIGRATIONS = "db/migrations/directory";
const HOUSEHOLD_MIGRATIONS = "db/migrations/household";

type TestClient = {
	client: Client;
	path: string;
	close: () => Promise<void>;
};

type TestDbMigrationOptions = {
	throughMigration?: string;
};

export type TestDirectoryDb = TestClient & {
	db: ReturnType<typeof directoryDb>;
};

export type TestHouseholdDb = TestClient & {
	db: ReturnType<typeof householdDb>;
};

export async function createTestDirectoryDb(): Promise<TestDirectoryDb> {
	const testClient = await createMigratedTestClient(
		"directory.db",
		DIRECTORY_MIGRATIONS,
	);
	return {
		...testClient,
		db: directoryDb(testClient.client),
	};
}

export async function createTestHouseholdDb(
	options: TestDbMigrationOptions = {},
): Promise<TestHouseholdDb> {
	const testClient = await createMigratedTestClient(
		"household.db",
		HOUSEHOLD_MIGRATIONS,
		options,
	);
	return {
		...testClient,
		db: householdDb(testClient.client),
	};
}

async function createMigratedTestClient(
	filename: string,
	migrationsFolder: string,
	options: TestDbMigrationOptions = {},
): Promise<TestClient> {
	const directory = await mkdtemp(path.join(tmpdir(), "dont-forget-test-"));
	const dbPath = path.join(directory, filename);
	const client = createClient({ url: `file:${dbPath}` });

	await client.execute("PRAGMA foreign_keys = ON");
	await client.execute("PRAGMA busy_timeout = 5000");
	await client.execute("PRAGMA journal_mode = WAL");
	await applyMigrations(
		client,
		path.join(process.cwd(), migrationsFolder),
		options,
	);

	return {
		client,
		path: dbPath,
		close: async () => {
			client.close();
			await rm(directory, { recursive: true, force: true });
		},
	};
}

async function applyMigrations(
	client: Client,
	migrationsFolder: string,
	options: TestDbMigrationOptions,
) {
	const files = (await readdir(migrationsFolder))
		.filter((file) => file.endsWith(".sql"))
		.filter(
			(file) =>
				!options.throughMigration ||
				migrationAtOrBefore(file, options.throughMigration),
		)
		.sort();
	const journal = await readMigrationJournal(migrationsFolder);

	// Mirror the real migrator's tracking table so test DBs report the same
	// schema version a server-migrated DB would (the schema staleness gate
	// reads max(created_at); drizzle writes the journal `when` there).
	await client.execute(
		`CREATE TABLE IF NOT EXISTS ${DRIZZLE_MIGRATIONS_TABLE} (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)`,
	);

	for (const file of files) {
		const sql = await readFile(path.join(migrationsFolder, file), "utf8");
		const statements = sql
			.split("--> statement-breakpoint")
			.map((statement) => statement.trim())
			.filter(Boolean);

		for (const statement of statements) {
			await client.execute(statement);
		}

		const tag = file.replace(/\.sql$/, "");
		const entry = journal.get(tag);
		if (!entry) {
			throw new Error(`Migration ${file} has no journal entry`);
		}
		await client.execute({
			sql: `INSERT INTO ${DRIZZLE_MIGRATIONS_TABLE} (hash, created_at) VALUES (?, ?)`,
			args: [tag, entry.when],
		});
	}
}

async function readMigrationJournal(
	migrationsFolder: string,
): Promise<Map<string, { when: number }>> {
	const journal = JSON.parse(
		await readFile(path.join(migrationsFolder, "meta/_journal.json"), "utf8"),
	) as { entries: { tag: string; when: number }[] };
	return new Map(journal.entries.map((entry) => [entry.tag, entry]));
}

export function migrationAtOrBefore(file: string, target: string): boolean {
	return file <= target;
}
