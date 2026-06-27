import {
	type ChildProcessWithoutNullStreams,
	execFile,
	spawn,
} from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { type Client, createClient } from "@libsql/client/node";
import { drizzle as pgliteDrizzle } from "drizzle-orm/pglite";
import * as directorySchema from "@/db/schema/postgres";
import { type directoryDb, householdDb } from "@/db/server/client";
import { DRIZZLE_MIGRATIONS_TABLE } from "@/db/utils";

const DIRECTORY_MIGRATIONS = "db/migrations/postgres";
const HOUSEHOLD_MIGRATIONS = "db/migrations/household";
const execFileAsync = promisify(execFile);
let pgliteTemplateFilePromise: Promise<string> | undefined;
let pgliteTemplateDirectory: string | undefined;

type TestLibsqlClient = {
	client: Client;
	path: string;
	close: () => Promise<void>;
};

type TestPgliteClient = {
	client: RemotePgliteClient;
	path: string;
	close: () => Promise<void>;
};

type TestDbMigrationOptions = {
	throughMigration?: string;
};

export type TestDirectoryDb = TestPgliteClient & {
	db: ReturnType<typeof directoryDb>;
};

export type TestHouseholdDb = TestLibsqlClient & {
	db: ReturnType<typeof householdDb>;
};

export async function createTestDirectoryDb(): Promise<TestDirectoryDb> {
	const testClient = await createMigratedTestPgliteClient(DIRECTORY_MIGRATIONS);
	return {
		...testClient,
		// The remote client exposes the PGlite query/transaction surface Drizzle uses;
		// production still constructs DirectoryDb with pg.Pool.
		db: pgliteDrizzle(testClient.client as never, {
			schema: directorySchema,
		}) as unknown as ReturnType<typeof directoryDb>,
	};
}

export async function createTestHouseholdDb(
	options: TestDbMigrationOptions = {},
): Promise<TestHouseholdDb> {
	const testClient = await createMigratedTestLibsqlClient(
		"household.db",
		HOUSEHOLD_MIGRATIONS,
		options,
	);
	return {
		...testClient,
		db: householdDb(testClient.client),
	};
}

async function createMigratedTestPgliteClient(
	migrationsFolder: string,
): Promise<TestPgliteClient> {
	const directory = await mkdtemp(path.join(tmpdir(), "dont-forget-test-"));
	const dataDir = path.join(directory, "directory");
	const client = await RemotePgliteClient.create(
		dataDir,
		await testPgliteTemplateFile(),
	);

	await applyPgMigrations(client, path.join(process.cwd(), migrationsFolder));

	return {
		client,
		path: dataDir,
		close: async () => {
			await client.close();
			await rm(directory, { recursive: true, force: true });
		},
	};
}

function testPgliteTemplateFile(): Promise<string> {
	pgliteTemplateFilePromise ??= loadTestPgliteTemplateFile();
	return pgliteTemplateFilePromise;
}

async function loadTestPgliteTemplateFile(): Promise<string> {
	const directory = await mkdtemp(path.join(tmpdir(), "dont-forget-pglite-"));
	pgliteTemplateDirectory = directory;
	const templatePath = path.join(directory, "template.tar");

	await execFileAsync(
		process.execPath,
		["--input-type=module", "-e", PGLITE_TEMPLATE_SCRIPT, templatePath],
		{ cwd: process.cwd() },
	);

	return templatePath;
}

if (typeof afterAll === "function") {
	afterAll(async () => {
		if (pgliteTemplateDirectory) {
			await rm(pgliteTemplateDirectory, { recursive: true, force: true });
			pgliteTemplateDirectory = undefined;
		}
	});
}

type RemotePgliteRowMode = "array" | "object";

type RemotePgliteQueryOptions = {
	rowMode?: RemotePgliteRowMode;
};

type RemotePgliteQueryResult = {
	rows: unknown[];
};

type RemotePgliteError = {
	message: string;
	name: string;
	properties: Record<string, unknown>;
};

type RemotePgliteResponse =
	| { id: number; result: unknown }
	| { id: number; error: RemotePgliteError }
	| { type: "ready" }
	| { type: "init-error"; error: RemotePgliteError };

type PendingRemoteRequest = {
	resolve: (result: unknown) => void;
	reject: (error: Error) => void;
};

class RemotePgliteClient {
	readonly ready: Promise<void>;

	private readonly child: ChildProcessWithoutNullStreams;
	private readonly exit: Promise<void>;
	private nextRequestId = 1;
	private pending = new Map<number, PendingRemoteRequest>();
	private stdoutBuffer = "";
	private stderrBuffer = "";
	private queue: Promise<void> = Promise.resolve();
	private closed = false;
	private resolveReady!: () => void;
	private rejectReady!: (error: Error) => void;

	private constructor(dataDir: string, templatePath: string) {
		this.ready = new Promise((resolve, reject) => {
			this.resolveReady = resolve;
			this.rejectReady = reject;
		});
		this.child = spawn(
			process.execPath,
			[
				"--input-type=module",
				"-e",
				PGLITE_WORKER_SCRIPT,
				dataDir,
				templatePath,
			],
			{ cwd: process.cwd() },
		);
		this.exit = new Promise((resolve) => {
			this.child.once("exit", () => {
				resolve();
			});
		});

		this.child.stdout.on("data", (chunk: Buffer) => {
			this.handleStdout(chunk.toString("utf8"));
		});
		this.child.stderr.on("data", (chunk: Buffer) => {
			this.stderrBuffer += chunk.toString("utf8");
		});
		this.child.once("error", (error) => {
			this.rejectReady(error);
			this.rejectPending(error);
		});
		this.child.once("exit", (code, signal) => {
			if (!this.closed) {
				const detail = this.stderrBuffer.trim();
				const message = `PGlite worker exited before close (code ${code}, signal ${signal})${
					detail ? `: ${detail}` : ""
				}`;
				const error = new Error(message);
				this.rejectReady(error);
				this.rejectPending(error);
			}
		});
	}

	static async create(
		dataDir: string,
		templatePath: string,
	): Promise<RemotePgliteClient> {
		const client = new RemotePgliteClient(dataDir, templatePath);
		await client.ready;
		return client;
	}

	query(
		sql: string,
		params: unknown[] = [],
		options: RemotePgliteQueryOptions = {},
	): Promise<RemotePgliteQueryResult> {
		return this.enqueue(() => this.queryDirect(sql, params, options));
	}

	exec(sql: string): Promise<unknown> {
		return this.enqueue(() => this.execDirect(sql));
	}

	transaction<T>(
		transaction: (tx: RemotePgliteTransactionClient) => Promise<T>,
	): Promise<T> {
		return this.enqueue(async () => {
			const tx = new RemotePgliteTransactionClient(this);
			await tx.query("BEGIN");
			try {
				const result = await transaction(tx);
				await tx.query("COMMIT");
				return result;
			} catch (error) {
				await tx.query("ROLLBACK").catch(() => {});
				throw error;
			}
		});
	}

	async close(): Promise<void> {
		await this.queue.catch(() => {});
		if (this.child.exitCode !== null) {
			this.closed = true;
			await this.exit;
			return;
		}

		await this.request("close", {}).catch(() => {});
		this.closed = true;
		this.child.stdin.end();
		await this.exit;
	}

	queryDirect(
		sql: string,
		params: unknown[] = [],
		options: RemotePgliteQueryOptions = {},
	): Promise<RemotePgliteQueryResult> {
		return this.request("query", {
			params,
			rowMode: options.rowMode,
			sql,
		}) as Promise<RemotePgliteQueryResult>;
	}

	execDirect(sql: string): Promise<unknown> {
		return this.request("exec", { sql });
	}

	private enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const run = this.queue.then(operation, operation);
		this.queue = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}

	private request(operation: string, payload: Record<string, unknown>) {
		if (this.closed) {
			return Promise.reject(new Error("PGlite worker is closed"));
		}

		const id = this.nextRequestId;
		this.nextRequestId += 1;
		const request = { id, operation, ...payload };

		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.child.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
				if (error) {
					this.pending.delete(id);
					reject(error);
				}
			});
		});
	}

	private handleStdout(chunk: string) {
		this.stdoutBuffer += chunk;
		let newlineIndex = this.stdoutBuffer.indexOf("\n");

		while (newlineIndex !== -1) {
			const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
			this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);

			if (line) {
				this.handleMessage(JSON.parse(line) as RemotePgliteResponse);
			}

			newlineIndex = this.stdoutBuffer.indexOf("\n");
		}
	}

	private handleMessage(message: RemotePgliteResponse) {
		if ("type" in message) {
			if (message.type === "ready") {
				this.resolveReady();
			} else {
				this.rejectReady(remoteError(message.error));
			}
			return;
		}

		const pending = this.pending.get(message.id);
		if (!pending) {
			return;
		}
		this.pending.delete(message.id);

		if ("error" in message) {
			pending.reject(remoteError(message.error));
		} else {
			pending.resolve(message.result);
		}
	}

	private rejectPending(error: Error) {
		for (const pending of this.pending.values()) {
			pending.reject(error);
		}
		this.pending.clear();
	}
}

class RemotePgliteTransactionClient {
	constructor(private readonly client: RemotePgliteClient) {}

	query(
		sql: string,
		params: unknown[] = [],
		options: RemotePgliteQueryOptions = {},
	): Promise<RemotePgliteQueryResult> {
		return this.client.queryDirect(sql, params, options);
	}

	exec(sql: string): Promise<unknown> {
		return this.client.execDirect(sql);
	}
}

function remoteError(remote: RemotePgliteError): Error {
	const error = new Error(remote.message);
	error.name = remote.name;
	Object.assign(error, remote.properties);
	return error;
}

const PGLITE_TEMPLATE_SCRIPT = `
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const outputPath = process.argv[1];
const directory = await mkdtemp(path.join(tmpdir(), "dont-forget-pglite-template-"));

try {
  const client = await PGlite.create(path.join(directory, "db"));
  const dump = await client.dumpDataDir("none");
  await writeFile(outputPath, new Uint8Array(await dump.arrayBuffer()));
  await client.close();
} finally {
  await rm(directory, { recursive: true, force: true });
}
`;

const PGLITE_WORKER_SCRIPT = `
import { Blob as NodeBlob } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

const dataDir = process.argv[1];
const templatePath = process.argv[2];
let client;
let queue = Promise.resolve();

function send(message) {
  process.stdout.write(JSON.stringify(message, (_key, value) => {
    if (typeof value === "bigint") {
      return Number(value);
    }
    return value;
  }) + "\\n");
}

function serializeError(error) {
  const properties = {};
  if (error && typeof error === "object") {
    for (const key of [
      "code",
      "constraint",
      "detail",
      "schema",
      "table",
      "column",
      "severity",
    ]) {
      if (error[key] !== undefined) {
        properties[key] = error[key];
      }
    }
  }

  return {
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : "Error",
    properties,
  };
}

async function handle(message) {
  if (message.operation === "query") {
    const options = message.rowMode ? { rowMode: message.rowMode } : undefined;
    return client.query(message.sql, message.params ?? [], options);
  }
  if (message.operation === "exec") {
    return client.exec(message.sql);
  }
  if (message.operation === "close") {
    await client.close();
    return true;
  }
  throw new Error("Unknown PGlite worker operation: " + message.operation);
}

try {
  const template = new NodeBlob(
    [await readFile(templatePath)],
    { type: "application/x-tar" },
  );
  client = await PGlite.create(dataDir, { loadDataDir: template });
  send({ type: "ready" });
} catch (error) {
  send({ type: "init-error", error: serializeError(error) });
  process.exit(1);
}

const input = readline.createInterface({ input: process.stdin });
input.on("line", (line) => {
  const message = JSON.parse(line);
  queue = queue.then(
    () => handle(message),
    () => handle(message),
  ).then(
    (result) => {
      send({ id: message.id, result });
    },
    (error) => {
      send({ id: message.id, error: serializeError(error) });
    },
  );
});
`;

async function createMigratedTestLibsqlClient(
	filename: string,
	migrationsFolder: string,
	options: TestDbMigrationOptions = {},
): Promise<TestLibsqlClient> {
	const directory = await mkdtemp(path.join(tmpdir(), "dont-forget-test-"));
	const dbPath = path.join(directory, filename);
	const client = createClient({ url: `file:${dbPath}` });

	await client.execute("PRAGMA foreign_keys = ON");
	await client.execute("PRAGMA busy_timeout = 5000");
	await client.execute("PRAGMA journal_mode = WAL");
	await applyLibsqlMigrations(
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

async function applyPgMigrations(
	client: RemotePgliteClient,
	migrationsFolder: string,
) {
	const files = (await readdir(migrationsFolder))
		.filter((file) => file.endsWith(".sql"))
		.sort();
	const journal = await readMigrationJournal(migrationsFolder);

	await client.exec(
		`CREATE TABLE IF NOT EXISTS ${DRIZZLE_MIGRATIONS_TABLE} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
	);

	for (const file of files) {
		const sql = await readFile(path.join(migrationsFolder, file), "utf8");
		const statements = sql
			.split("--> statement-breakpoint")
			.map((statement) => statement.trim())
			.filter(Boolean);

		for (const statement of statements) {
			await client.exec(statement);
		}

		const tag = file.replace(/\.sql$/, "");
		const entry = journal.get(tag);
		if (!entry) {
			throw new Error(`Migration ${file} has no journal entry`);
		}
		await client.query(
			`INSERT INTO ${DRIZZLE_MIGRATIONS_TABLE} (hash, created_at) VALUES ($1, $2)`,
			[tag, entry.when],
		);
	}
}

async function applyLibsqlMigrations(
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
