/**
 * Spike: verify @tursodatabase/sync behavior around schema changes.
 * Kept as reproducible proof for docs/adr/0013-household-schema-staleness-gate.md.
 *
 * FINDINGS (0.6.0 and 0.6.1) — several checks "fail" because the engine
 * behaves BETTER than the hypotheses they encode:
 *  T1  pull() DOES apply remote DDL to an existing replica (T1/premise
 *      checks report ❌ by design — they encoded the disproven hypothesis).
 *  T2  Re-running DDL locally that remote already ran fails with
 *      "duplicate column" — client-applied migrations are not viable.
 *  T3  Remote `PRAGMA user_version = N` is rejected by Turso Cloud, and
 *      pull() clobbers a locally-set user_version — not a usable signal.
 *  C   Restart simulation: read-before-pull on a stale replica reproduces
 *      the app's "no such column" failure; one pull() heals it.
 *  T4  push() carries local DDL up to a not-yet-migrated remote.
 *
 * Run with: APP_ENV=local pnpm tsx scripts/spike-local-ddl-sync.mts
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "@tursodatabase/sync";
import * as dbClient from "@/db/client";
import * as env from "@/lib/env";
import * as loadEnv from "@/lib/load-env";
import * as platformApi from "./turso-platform-api";

// tsx transpiles project TS files to CJS; named exports land on `.default`
function interop<T>(module: T): T {
	return ((module as { default?: T }).default ?? module) as T;
}
const { householdClient } = interop(dbClient);
const { readTursoOperatorConfig } = interop(env);
const { loadEnvFile } = interop(loadEnv);
const { tursoPlatformApi } = interop(platformApi);

type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];

function record(name: string, pass: boolean, detail: string) {
	checks.push({ name, pass, detail });
	console.log(`${pass ? "✅" : "❌"} ${name} — ${detail}`);
}

function info(name: string, detail: string) {
	console.log(`ℹ️  ${name} — ${detail}`);
}

async function main() {
	const appEnv = loadEnvFile();
	if (appEnv !== "local") throw new Error("Spike must run with APP_ENV=local");
	const config = readTursoOperatorConfig();
	const platform = tursoPlatformApi(config);
	const tmp = mkdtempSync(join(tmpdir(), "ddl-spike-"));
	const stamp = `${Date.now()}`.slice(-8);
	const dbAName = `df-local-spike-a-${stamp}`;
	const dbBName = `df-local-spike-b-${stamp}`;
	const cleanups: (() => Promise<void>)[] = [];


	try {
		// ── Phase A setup: scratch DB at schema v1 ─────────────────────────────
		console.log(`\n[setup] creating ${dbAName}`);
		const dbA = await platform.ensureDatabase(dbAName, config.group);
		cleanups.push(() => platform.deleteDatabase(dbAName));
		const remoteA = householdClient(dbA.url, config.platformGroupToken);
		await remoteA.execute(
			"CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
		);
		// Turso Cloud rejects remote `PRAGMA user_version = N` (SQL_PARSE_ERROR:
		// "SQL not allowed statement"), so the server cannot stamp versions.
		// Simulate the Drizzle migration tracking table instead — truthful at
		// bootstrap time, data-only afterwards.
		await remoteA.execute(
			"CREATE TABLE _spike_migrations (id INTEGER PRIMARY KEY, tag TEXT NOT NULL)",
		);
		await remoteA.execute(
			"INSERT INTO _spike_migrations (tag) VALUES ('0000_init')",
		);
		await remoteA.execute("INSERT INTO items (id, name) VALUES ('r0', 'seed')");

		const replicaToken = await platform.createAuthToken(dbAName, "1h");
		const replica = await connect({
			path: join(tmp, "replica-a.db"),
			url: dbA.url.replace("libsql://", "https://"),
			authToken: replicaToken,
			clientName: "ddl-spike",
		});
		await replica.pull();

		const localRows = async () =>
			(await (await replica.prepare("SELECT * FROM items ORDER BY id")).all()) as Record<
				string,
				unknown
			>[];
		const localColumns = async () =>
			((await (await replica.prepare("PRAGMA table_info(items)")).all()) as {
				name: string;
			}[]).map((c) => c.name);
		const localUserVersion = async () =>
			((await (await replica.prepare("PRAGMA user_version")).get()) as {
				user_version: number;
			}).user_version;
		const localMigrationRows = async () =>
			(await (
				await replica.prepare("SELECT tag FROM _spike_migrations ORDER BY id")
			).all()) as { tag: string }[];
		const remoteColumns = async () =>
			(await remoteA.execute("PRAGMA table_info(items)")).rows.map((r) =>
				String(r.name),
			);

		// T3a: tracking table is truthful at bootstrap; local PRAGMA write works
		const bootMigrations = await localMigrationRows();
		record(
			"T3a bootstrap carries tracking table (truthful at bootstrap)",
			bootMigrations.length === 1,
			`local tracking rows after bootstrap: ${JSON.stringify(bootMigrations)}`,
		);
		let localPragmaError: unknown = null;
		try {
			await replica.exec("PRAGMA user_version = 1");
		} catch (error) {
			localPragmaError = error;
		}
		const bootVersion = localPragmaError === null ? await localUserVersion() : -1;
		record(
			"T3a' local PRAGMA user_version write works on the sync engine",
			localPragmaError === null && bootVersion === 1,
			localPragmaError
				? `THREW: ${localPragmaError}`
				: `local user_version = ${bootVersion} (want 1)`,
		);
		const bootRows = await localRows();
		record(
			"setup: bootstrap carries schema+rows",
			bootRows.length === 1,
			`rows after bootstrap: ${JSON.stringify(bootRows)}`,
		);

		// sanity: local write pushes
		await replica.exec("INSERT INTO items (id, name) VALUES ('l1', 'local-1')");
		await replica.push();
		const remoteAfterL1 = await remoteA.execute("SELECT id FROM items ORDER BY id");
		record(
			"setup: local row push works",
			remoteAfterL1.rows.length === 2,
			`remote ids: ${remoteAfterL1.rows.map((r) => r.id).join(",")}`,
		);

		// ── Remote migration happens (the fanout) ──────────────────────────────
		console.log("\n[phase] remote ALTER TABLE + tracking row + new-column row");
		await remoteA.execute("ALTER TABLE items ADD COLUMN quantity INTEGER");
		await remoteA.execute(
			"INSERT INTO _spike_migrations (tag) VALUES ('0001_quantity')",
		);
		await remoteA.execute(
			"INSERT INTO items (id, name, quantity) VALUES ('r2', 'remote-2', 5)",
		);

		// T1: does pull bring DDL?
		let pullError: unknown = null;
		try {
			await replica.pull();
		} catch (error) {
			pullError = error;
		}
		info("pull after remote DDL", pullError ? `THREW: ${pullError}` : "succeeded");
		const colsAfterPull = await localColumns();
		record(
			"T1 pull does NOT apply remote DDL (expected limitation)",
			!colsAfterPull.includes("quantity"),
			`local columns after pull: ${colsAfterPull.join(",")}`,
		);
		const rowsAfterPull = await localRows();
		info(
			"row with new column arriving at stale replica",
			`local rows after pull: ${JSON.stringify(rowsAfterPull)}`,
		);
		// premise: tracking rows DO replicate down without the DDL (the table lies)
		const migrationsAfterPull = await localMigrationRows();
		record(
			"premise: tracking rows replicate without DDL (table lies post-bootstrap)",
			migrationsAfterPull.length === 2 && !colsAfterPull.includes("quantity"),
			`local tracking rows: ${JSON.stringify(migrationsAfterPull)}; quantity column locally: ${colsAfterPull.includes("quantity")}`,
		);
		// T3b: pull doesn't replicate/clobber user_version
		const versionAfterPull = await localUserVersion();
		record(
			"T3b pull leaves user_version alone",
			versionAfterPull === 1,
			`local user_version after pull = ${versionAfterPull} (want 1)`,
		);

		// ── T2 CORE: client applies the same DDL locally ───────────────────────
		console.log("\n[phase] apply same ALTER locally, then push/pull");
		let localDdlError: unknown = null;
		try {
			await replica.exec("ALTER TABLE items ADD COLUMN quantity INTEGER");
			await replica.exec("PRAGMA user_version = 2");
		} catch (error) {
			localDdlError = error;
		}
		record(
			"T2a local DDL executes on replica",
			localDdlError === null,
			localDdlError ? String(localDdlError) : "ALTER TABLE ok locally",
		);

		let pushAfterDdlError: unknown = null;
		try {
			await replica.push();
		} catch (error) {
			pushAfterDdlError = error;
		}
		const remoteColsAfterPush = await remoteColumns();
		const quantityCount = remoteColsAfterPush.filter(
			(c) => c === "quantity",
		).length;
		record(
			"T2b push after duplicate local DDL is clean",
			pushAfterDdlError === null && quantityCount === 1,
			pushAfterDdlError
				? `push THREW: ${pushAfterDdlError}`
				: `remote columns: ${remoteColsAfterPush.join(",")} (quantity x${quantityCount})`,
		);

		let pullAfterDdlError: unknown = null;
		try {
			await replica.pull();
		} catch (error) {
			pullAfterDdlError = error;
		}
		const colsAfterRoundtrip = await localColumns();
		record(
			"T2c pull after local DDL keeps local schema intact",
			pullAfterDdlError === null && colsAfterRoundtrip.includes("quantity"),
			pullAfterDdlError
				? `pull THREW: ${pullAfterDdlError}`
				: `local columns: ${colsAfterRoundtrip.join(",")}`,
		);

		// both directions carry the new column's data now
		await replica.exec(
			"INSERT INTO items (id, name, quantity) VALUES ('l3', 'local-3', 7)",
		);
		await replica.push();
		const remoteL3 = await remoteA.execute(
			"SELECT quantity FROM items WHERE id = 'l3'",
		);
		record(
			"T2d local row with new column reaches remote",
			Number(remoteL3.rows[0]?.quantity) === 7,
			`remote l3.quantity = ${remoteL3.rows[0]?.quantity}`,
		);
		await remoteA.execute(
			"INSERT INTO items (id, name, quantity) VALUES ('r4', 'remote-4', 9)",
		);
		await replica.pull();
		const localAfterR4 = await localRows();
		const r4 = localAfterR4.find((r) => r.id === "r4");
		record(
			"T2e remote row with new column reaches replica",
			r4 !== undefined && Number(r4.quantity) === 9,
			`local r4 = ${JSON.stringify(r4)}; all rows: ${JSON.stringify(localAfterR4)}`,
		);

		// T3c: push still succeeds after local user_version changes; header
		// changes shouldn't be part of the CDC stream (remote read of
		// user_version may itself be disallowed — treat as informative)
		await replica.exec("PRAGMA user_version = 42");
		let pushAfterVersionError: unknown = null;
		try {
			await replica.push();
		} catch (error) {
			pushAfterVersionError = error;
		}
		record(
			"T3c push succeeds after local user_version change",
			pushAfterVersionError === null,
			pushAfterVersionError ? `push THREW: ${pushAfterVersionError}` : "push ok",
		);
		try {
			const remoteVersion = await remoteA.execute("PRAGMA user_version");
			info(
				"remote user_version after local=42 + push",
				`${JSON.stringify(remoteVersion.rows)} (want untouched/0)`,
			);
		} catch (error) {
			info("remote user_version read", `disallowed remotely: ${error}`);
		}
		await replica.exec("PRAGMA user_version = 2");
		await replica.close();

		// ── Phase C: simulate the app's restart lifecycle ───────────────────────
		// remote migrates while the app is closed; app reopens the EXISTING
		// replica file, reads BEFORE any pull (today's openHouseholdStore flow),
		// then pulls and reads again.
		console.log("\n[phase] restart simulation: remote DDL while closed");
		await remoteA.execute("ALTER TABLE items ADD COLUMN note TEXT");
		await remoteA.execute(
			"INSERT INTO _spike_migrations (tag) VALUES ('0002_note')",
		);
		const reopened = await connect({
			path: join(tmp, "replica-a.db"),
			url: dbA.url.replace("libsql://", "https://"),
			authToken: replicaToken,
			clientName: "ddl-spike",
		});
		let staleReadError: unknown = null;
		try {
			await (await reopened.prepare("SELECT note FROM items")).all();
		} catch (error) {
			staleReadError = error;
		}
		record(
			"C1 read before pull on reopened stale replica fails (the app bug)",
			staleReadError !== null,
			staleReadError ? `read threw as expected: ${staleReadError}` : "read unexpectedly succeeded — replica was already fresh at open",
		);
		await reopened.pull();
		let healedReadError: unknown = null;
		try {
			await (await reopened.prepare("SELECT note FROM items")).all();
		} catch (error) {
			healedReadError = error;
		}
		record(
			"C2 read after pull succeeds (pull heals the schema)",
			healedReadError === null,
			healedReadError ? `read STILL failing: ${healedReadError}` : "stale replica healed by pull()",
		);
		await reopened.close();
		await remoteA.close();

		// ── Phase B (informative): ordering violation ──────────────────────────
		console.log(`\n[setup] creating ${dbBName} (ordering-violation phase)`);
		const dbB = await platform.ensureDatabase(dbBName, config.group);
		cleanups.push(() => platform.deleteDatabase(dbBName));
		const remoteB = householdClient(dbB.url, config.platformGroupToken);
		await remoteB.execute(
			"CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
		);
		const replicaBToken = await platform.createAuthToken(dbBName, "1h");
		const replicaB = await connect({
			path: join(tmp, "replica-b.db"),
			url: dbB.url.replace("libsql://", "https://"),
			authToken: replicaBToken,
			clientName: "ddl-spike",
		});
		await replicaB.pull();
		await replicaB.exec("ALTER TABLE items ADD COLUMN quantity INTEGER");
		await replicaB.exec(
			"INSERT INTO items (id, name, quantity) VALUES ('b1', 'early', 3)",
		);
		let orderingPushError: unknown = null;
		try {
			await replicaB.push();
		} catch (error) {
			orderingPushError = error;
		}
		const remoteBRows = await remoteB.execute("SELECT * FROM items");
		const remoteBCols = (await remoteB.execute("PRAGMA table_info(items)")).rows.map(
			(r) => String(r.name),
		);
		info(
			"T4 ordering violation (local DDL+row push before remote migrated)",
			orderingPushError
				? `push THREW: ${orderingPushError}`
				: `push ok; remote columns: ${remoteBCols.join(",")}; remote rows: ${JSON.stringify(remoteBRows.rows)}`,
		);
		await replicaB.close();
		await remoteB.close();
	} finally {
		for (const cleanup of cleanups) await cleanup();
		rmSync(tmp, { recursive: true, force: true });
	}

	const failed = checks.filter((c) => !c.pass);
	console.log(
		`\n=== SPIKE RESULT: ${checks.length - failed.length}/${checks.length} checks passed ===`,
	);
	if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
