import { createServer, type Server } from "node:http";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { Pool } from "pg";

import { createApiApp } from "@/server/app";
import { readApiServerConfig } from "@/server/config";
import { directoryDb } from "@/server/db/client";
import { defaultAuthenticate, defaultWithTransaction } from "@/server/sync";
import { DEFAULT_API_PORT } from "@/shared/env";
import { deferred, waitForAsync } from "@/test/async";
import { loadEnvFile } from "@/shared/load-env";
import { startApiServer } from "./main";

// Composition-boundary mocks are intentional: this suite proves dependency
// identity and lifecycle wiring. Hono routing, the real Node adapter, Pool/DB
// behavior, and domain behavior are covered at their own boundaries.
jest.mock("pg");
jest.mock("@hono/node-server", () => ({ serve: jest.fn() }));
jest.mock("@/server/app", () => ({ createApiApp: jest.fn() }));
jest.mock("@/server/config", () => ({ readApiServerConfig: jest.fn() }));
jest.mock("@/server/db/client", () => ({ directoryDb: jest.fn() }));
jest.mock("@/server/sync", () => ({
	defaultAuthenticate: jest.fn(),
	defaultWithTransaction: jest.fn(),
}));
jest.mock("@/shared/load-env", () => ({ loadEnvFile: jest.fn() }));

const config = {
	appEnv: "local",
	databaseUrl: "postgresql://synthetic.invalid/dont_forget",
	clerkSecretKey: "sk_test_synthetic",
	publicAppBaseUrl: "https://app.invalid",
	resendApiKey: "re_synthetic",
	resendFromAddress: "sender@example.com",
	posthogProjectToken: "phc_synthetic",
	posthogHost: "https://posthog.invalid",
	apiPort: DEFAULT_API_PORT,
} as const;

const readinessResult = {
	command: "SELECT",
	rowCount: 1,
	oid: 0,
	rows: [{ ready: 1 }],
	fields: [],
};

const mockedServe = jest.mocked(serve);
const mockedCreateApiApp = jest.mocked(createApiApp);
const mockedReadApiServerConfig = jest.mocked(readApiServerConfig);
const mockedLoadEnvFile = jest.mocked(loadEnvFile);
const mockedDirectoryDb = jest.mocked(directoryDb);
const mockedDefaultAuthenticate = jest.mocked(defaultAuthenticate);
const mockedDefaultWithTransaction = jest.mocked(defaultWithTransaction);
const mockedPool = jest.mocked(Pool);
const originalAppEnv = process.env.APP_ENV;

function processExitWithoutTerminating(
	_code?: string | number | null,
): never;
function processExitWithoutTerminating(): undefined {
	return undefined;
}

function constructedPool(): Pool {
	const pool = mockedPool.mock.instances.at(0);
	if (!pool) {
		throw new Error("Expected one constructed Pool");
	}
	return pool;
}

function createdAppDeps(): Parameters<typeof createApiApp>[0] {
	const deps = mockedCreateApiApp.mock.calls.at(0)?.at(0);
	if (!deps) {
		throw new Error("Expected createApiApp deps");
	}
	return deps;
}

function registeredSignalListener(
	signal: "SIGINT" | "SIGTERM",
): (...args: unknown[]) => unknown {
	const call = jest
		.mocked(process.once)
		.mock.calls.find(([event]) => event === signal);
	const listener = call?.at(1);
	if (typeof listener !== "function") {
		throw new Error(`Expected ${signal} listener`);
	}
	return listener;
}

function emitRegisteredPoolError(error: Error): void {
	const call = jest
		.mocked(Pool.prototype.on)
		.mock.calls.find(([event]) => event === "error");
	const listener = call?.at(1);
	if (typeof listener !== "function") {
		throw new Error("Expected Pool error listener");
	}
	Reflect.apply(listener, undefined, [error]);
}

describe("startApiServer", () => {
	let server: Server;

	beforeEach(() => {
		jest.clearAllMocks();
		process.env.APP_ENV = "local";
		server = createServer();
		jest.spyOn(server, "close").mockImplementation((callback) => {
			callback?.();
			return server;
		});
		jest.spyOn(server, "closeAllConnections").mockImplementation(() => {});
		jest.spyOn(process, "once").mockImplementation(jest.fn());
		jest
			.spyOn(process, "exit")
			.mockImplementation(processExitWithoutTerminating);
		jest.spyOn(console, "log").mockImplementation(jest.fn());
		jest.spyOn(console, "error").mockImplementation(jest.fn());
		mockedServe.mockReturnValue(server);
		mockedCreateApiApp.mockReturnValue(new Hono());
		mockedReadApiServerConfig.mockReturnValue(config);
		jest
			.mocked(Pool.prototype.query)
			.mockImplementation(async () => readinessResult);
		jest.mocked(Pool.prototype.end).mockImplementation(async () => {});
	});

	afterEach(() => {
		if (originalAppEnv === undefined) {
			delete process.env.APP_ENV;
		} else {
			process.env.APP_ENV = originalAppEnv;
		}
		jest.restoreAllMocks();
	});

	it("loads local env before config and completes readiness before listen", async () => {
		const order: string[] = [];
		const readiness = deferred<void>();
		mockedLoadEnvFile.mockImplementation(() => {
			order.push("load env");
			return "local";
		});
		mockedReadApiServerConfig.mockImplementation(() => {
			order.push("read config");
			return config;
		});
		jest.mocked(Pool.prototype.query).mockImplementation(async () => {
			order.push("readiness start");
			await readiness.promise;
			order.push("readiness complete");
			return readinessResult;
		});
		mockedServe.mockImplementation((options, listeningListener) => {
			order.push("listen");
			listeningListener?.({
				address: "0.0.0.0",
				family: "IPv4",
				port: config.apiPort,
			});
			return server;
		});

		const start = startApiServer();
		await Promise.resolve();

		expect(order).toEqual(["load env", "read config", "readiness start"]);
		expect(mockedServe).not.toHaveBeenCalled();

		readiness.resolve();
		await start;

		expect(order).toEqual([
			"load env",
			"read config",
			"readiness start",
			"readiness complete",
			"listen",
		]);
	});

	it.each(["staging", "production"] as const)(
		"does not load dotenv for %s",
		async (appEnv) => {
			process.env.APP_ENV = appEnv;
			mockedReadApiServerConfig.mockReturnValue({ ...config, appEnv });

			await startApiServer();

			expect(mockedLoadEnvFile).not.toHaveBeenCalled();
			expect(mockedReadApiServerConfig).toHaveBeenCalledTimes(1);
			expect(mockedReadApiServerConfig).toHaveBeenCalledWith(process.env);
		},
	);

	it("wires one Pool through readiness and every production dependency", async () => {
		await startApiServer();

		expect(mockedPool).toHaveBeenCalledTimes(1);
		expect(mockedPool).toHaveBeenCalledWith({
			connectionString: config.databaseUrl,
		});
		const pool = constructedPool();
		expect(Pool.prototype.query).toHaveBeenCalledWith("SELECT 1");
		expect(jest.mocked(Pool.prototype.query).mock.contexts.at(0)).toBe(pool);
		expect(mockedDirectoryDb).toHaveBeenCalledWith(pool);

		const appDeps = createdAppDeps();
		expect(appDeps.directory).toBe(
			mockedDirectoryDb.mock.results.at(0)?.value,
		);
		expect(appDeps.authenticate).toBeUndefined();

		const request = new Request("https://api.invalid/api/data", {
			method: "POST",
		});
		await appDeps.data.authenticate(request);
		expect(mockedDefaultAuthenticate).toHaveBeenCalledWith(request, pool);

		const runTransaction = jest.fn(async () => "result");
		await appDeps.data.withTransaction(runTransaction);
		expect(mockedDefaultWithTransaction).toHaveBeenCalledWith(
			pool,
			runTransaction,
		);
	});

	it("binds the app fetch function to the configured public listener", async () => {
		const app = new Hono();
		mockedCreateApiApp.mockReturnValue(app);

		await startApiServer();

		expect(mockedServe).toHaveBeenCalledTimes(1);
		expect(mockedServe.mock.calls.at(0)?.at(0)).toEqual({
			fetch: app.fetch,
			hostname: "0.0.0.0",
			port: config.apiPort,
		});
	});

	it("logs only safe context when the listener starts", async () => {
		const sensitiveConfig = {
			...config,
			databaseUrl: "postgresql://do-not-log.invalid/dont_forget",
			clerkSecretKey: "sk_test_do-not-log",
			resendApiKey: "re_do-not-log",
		};
		mockedReadApiServerConfig.mockReturnValue(sensitiveConfig);

		await startApiServer();
		const listeningListener = mockedServe.mock.calls.at(0)?.[1];
		if (!listeningListener) {
			throw new Error("Expected listening listener");
		}
		listeningListener({
			address: "0.0.0.0",
			family: "IPv4",
			port: sensitiveConfig.apiPort,
		});

		expect(console.log).toHaveBeenCalledTimes(1);
		expect(console.log).toHaveBeenCalledWith("api server listening", {
			app_env: sensitiveConfig.appEnv,
			hostname: "0.0.0.0",
			port: sensitiveConfig.apiPort,
		});
		const logged = JSON.stringify(jest.mocked(console.log).mock.calls);
		expect(logged).not.toContain("do-not-log");
	});

	it("registers one shared idempotent SIGTERM and SIGINT callback", async () => {
		await startApiServer();
		const sigterm = registeredSignalListener("SIGTERM");
		const sigint = registeredSignalListener("SIGINT");

		expect(sigterm).toBe(sigint);
		sigterm("SIGTERM");
		sigint("SIGINT");

		await waitForAsync(() => {
			expect(server.close).toHaveBeenCalledTimes(1);
			expect(Pool.prototype.end).toHaveBeenCalledTimes(1);
			expect(process.exit).toHaveBeenCalledWith(0);
			expect(process.exit).toHaveBeenCalledTimes(1);
		});
	});

	it("ends the Pool and rejects startup when readiness fails", async () => {
		const readinessError = new Error("synthetic readiness failure");
		jest.mocked(Pool.prototype.query).mockImplementation(async () => {
			throw readinessError;
		});

		await expect(startApiServer()).rejects.toBe(readinessError);

		expect(Pool.prototype.end).toHaveBeenCalledTimes(1);
		expect(mockedServe).not.toHaveBeenCalled();
		expect(process.exit).not.toHaveBeenCalled();
	});

	it("redacts idle Pool errors without exiting", async () => {
		await startApiServer();
		const idleError = new Error(
			"Bearer synthetic-sensitive sender@example.com?token=raw-token",
		);

		emitRegisteredPoolError(idleError);

		expect(console.error).toHaveBeenCalledWith(
			"api pool idle client error",
			expect.any(Object),
		);
		const logged = JSON.stringify(jest.mocked(console.error).mock.calls);
		expect(logged).not.toContain("synthetic-sensitive");
		expect(logged).not.toContain("sender@example.com");
		expect(logged).not.toContain("raw-token");
		expect(process.exit).not.toHaveBeenCalled();
	});

	it("uses nonzero graceful shutdown for server errors", async () => {
		await startApiServer();
		server.emit("error", new Error("synthetic server failure"));

		await waitForAsync(() => {
			expect(server.close).toHaveBeenCalledTimes(1);
			expect(Pool.prototype.end).toHaveBeenCalledTimes(1);
			expect(process.exit).toHaveBeenCalledWith(1);
		});
	});
});
