import type { Server } from "node:http";

import { type ServerType, serve } from "@hono/node-server";
import { Pool } from "pg";

import { createApiApp } from "@/server/app";
import { readApiServerConfig } from "@/server/config";
import { directoryDb } from "@/server/db/client";
import { createGracefulShutdown } from "@/server/lifecycle";
import { defaultAuthenticate, defaultWithTransaction } from "@/server/sync";
import { asError } from "@/shared/errors";
import { loadEnvFile } from "@/shared/load-env";
import { redactAttributes } from "@/shared/redact";

const API_HOST = "0.0.0.0";

export async function startApiServer(): Promise<void> {
	const explicitAppEnv = process.env.APP_ENV?.trim();
	if (explicitAppEnv !== undefined) {
		process.env.APP_ENV = explicitAppEnv;
	}
	if (explicitAppEnv === "local") {
		// loadEnvFile resolves from process.cwd(); make api intentionally runs at
		// the repository root.
		loadEnvFile();
	}

	const config = readApiServerConfig(process.env);
	const pool = new Pool({ connectionString: config.databaseUrl });
	pool.on("error", (error) => {
		logOperationalError("api pool idle client error", error);
	});

	try {
		await pool.query("SELECT 1");
	} catch (error) {
		await pool.end();
		throw error;
	}

	const app = createApiApp({
		directory: directoryDb(pool),
		publicWebBaseUrl: config.publicWebBaseUrl,
		data: {
			authenticate: (request) => defaultAuthenticate(request, pool),
			withTransaction: (run) => defaultWithTransaction(pool, run),
		},
	});
	const server = serve(
		{
			fetch: app.fetch,
			hostname: API_HOST,
			port: config.apiPort,
		},
		({ port }) => {
			console.log("api server listening", {
				app_env: config.appEnv,
				hostname: API_HOST,
				port,
			});
		},
	);
	if (!isHttpServer(server)) {
		throw new Error("Node adapter returned an unsupported server");
	}

	const shutdown = createGracefulShutdown({
		closeServer: () => closeServer(server),
		forceCloseServer: () => server.closeAllConnections(),
		endPool: () => pool.end(),
		exit: (code) => process.exit(code),
		logError: logOperationalError,
	});
	const handleSignal = () => {
		void shutdown();
	};
	process.once("SIGTERM", handleSignal);
	process.once("SIGINT", handleSignal);
	server.on("error", (error) => {
		logOperationalError("api server error", error);
		void shutdown(1);
	});
}

function isHttpServer(server: ServerType): server is Server {
	return "closeAllConnections" in server;
}

function closeServer(server: Server): Promise<void> {
	return new Promise((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}

function logOperationalError(message: string, error?: unknown): void {
	if (error === undefined) {
		console.error(message);
		return;
	}

	console.error(message, redactAttributes({ error: asError(error) }));
}

if (process.env.NODE_ENV !== "test") {
	void startApiServer().catch((error) => {
		logOperationalError("api startup failed", error);
		process.exit(1);
	});
}
