import type { Server } from "node:http";
import path from "node:path";
import { createServerAnalytics, installServerAnalytics } from "@api/analytics";
import { createApiApp } from "@api/app";
import { readApiServerConfig } from "@api/config";
import { defaultAuthenticate } from "@api/data/authenticate";
import { createClerkGateway } from "@api/http";
import { createGracefulShutdown } from "@api/lifecycle";
import { defaultWithTransaction, directoryDb } from "@dont-forget/db";
import { asError, redactAttributes } from "@dont-forget/shared";
import { loadEnvFile } from "@dont-forget/shared/node";
import { type ServerType, serve } from "@hono/node-server";
import { Pool } from "pg";

const API_HOST = "0.0.0.0";
const REPOSITORY_ROOT = path.resolve(process.cwd(), "../..");

export async function startApiServer(): Promise<void> {
	const explicitAppEnv = process.env.APP_ENV?.trim();
	if (explicitAppEnv !== undefined) {
		process.env.APP_ENV = explicitAppEnv;
	}
	if (explicitAppEnv === "local") {
		loadEnvFile({ cwd: REPOSITORY_ROOT });
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
	const clerk = createClerkGateway({ secretKey: config.clerkSecretKey });
	const analytics = createServerAnalytics({
		appEnv: config.appEnv,
		posthog: config.posthog,
	});
	installServerAnalytics(analytics);
	const directory = directoryDb(pool);

	const app = createApiApp({
		directory,
		publicWebBaseUrl: config.publicWebBaseUrl,
		clerk,
		analytics: analytics.analytics,
		data: {
			authenticate: (request) => defaultAuthenticate(request, directory, clerk),
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
		flushAnalytics: analytics.flush,
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
