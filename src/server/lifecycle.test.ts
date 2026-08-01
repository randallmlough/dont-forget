import { deferred } from "@/test/async";
import {
	createGracefulShutdown,
	SHUTDOWN_DEADLINE_MS,
} from "./lifecycle";

describe("createGracefulShutdown", () => {
	it("closes the server, ends the Pool, and exits cleanly in order", async () => {
		const order: string[] = [];
		const closeServer = jest.fn(async () => {
			order.push("close server");
		});
		const endPool = jest.fn(async () => {
			order.push("end Pool");
		});
		const exit = jest.fn((code: number) => {
			order.push(`exit ${code}`);
		});
		const shutdown = createGracefulShutdown({
			closeServer,
			forceCloseServer: jest.fn(),
			endPool,
			exit,
			logError: jest.fn(),
		});

		await shutdown();

		expect(order).toEqual(["close server", "end Pool", "exit 0"]);
		expect(closeServer).toHaveBeenCalledTimes(1);
		expect(endPool).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledTimes(1);
	});

	it("reuses one in-flight shutdown when a second signal arrives", async () => {
		const serverDrain = deferred<void>();
		const closeServer = jest.fn(() => serverDrain.promise);
		const endPool = jest.fn(async () => {});
		const exit = jest.fn();
		const shutdown = createGracefulShutdown({
			closeServer,
			forceCloseServer: jest.fn(),
			endPool,
			exit,
			logError: jest.fn(),
		});

		const firstSignal = shutdown();
		const secondSignal = shutdown();

		expect(secondSignal).toBe(firstSignal);
		expect(closeServer).toHaveBeenCalledTimes(1);
		expect(endPool).not.toHaveBeenCalled();
		expect(exit).not.toHaveBeenCalled();

		serverDrain.resolve();
		await firstSignal;

		expect(closeServer).toHaveBeenCalledTimes(1);
		expect(endPool).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledTimes(1);
	});

	it("force-closes and exits nonzero at the shutdown deadline", async () => {
		jest.useFakeTimers();
		try {
			const serverDrain = deferred<void>();
			const forceCloseServer = jest.fn();
			const endPool = jest.fn(async () => {});
			const exit = jest.fn();
			const logError = jest.fn();
			const shutdown = createGracefulShutdown({
				closeServer: jest.fn(() => serverDrain.promise),
				forceCloseServer,
				endPool,
				exit,
				logError,
			});

			const run = shutdown();
			jest.advanceTimersByTime(SHUTDOWN_DEADLINE_MS - 1);
			expect(forceCloseServer).not.toHaveBeenCalled();
			expect(exit).not.toHaveBeenCalled();

			jest.advanceTimersByTime(1);

			expect(forceCloseServer).toHaveBeenCalledTimes(1);
			expect(endPool).not.toHaveBeenCalled();
			expect(logError).toHaveBeenCalledWith(
				"api shutdown deadline exceeded",
			);
			expect(exit).toHaveBeenCalledWith(1);
			await expect(run).resolves.toBeUndefined();
		} finally {
			jest.useRealTimers();
		}
	});

	it("logs a Pool-end failure and exits nonzero once", async () => {
		jest.useFakeTimers();
		try {
			const poolError = new Error("synthetic Pool failure");
			const forceCloseServer = jest.fn();
			const exit = jest.fn();
			const logError = jest.fn();
			const shutdown = createGracefulShutdown({
				closeServer: jest.fn(async () => {}),
				forceCloseServer,
				endPool: jest.fn(async () => {
					throw poolError;
				}),
				exit,
				logError,
			});

			await expect(shutdown()).resolves.toBeUndefined();

			expect(logError).toHaveBeenCalledWith(
				"api pool shutdown failed",
				poolError,
			);
			expect(forceCloseServer).not.toHaveBeenCalled();
			expect(exit).toHaveBeenCalledWith(1);
			expect(exit).toHaveBeenCalledTimes(1);
		} finally {
			jest.clearAllTimers();
			jest.useRealTimers();
		}
	});

	it("attempts to end the Pool after a server-close failure", async () => {
		jest.useFakeTimers();
		try {
			const closeError = new Error("synthetic close failure");
			const endPool = jest.fn(async () => {});
			const exit = jest.fn();
			const logError = jest.fn();
			const shutdown = createGracefulShutdown({
				closeServer: jest.fn(async () => {
					throw closeError;
				}),
				forceCloseServer: jest.fn(),
				endPool,
				exit,
				logError,
			});

			await expect(shutdown()).resolves.toBeUndefined();

			expect(endPool).toHaveBeenCalledTimes(1);
			expect(logError).toHaveBeenCalledWith(
				"api server shutdown failed",
				closeError,
			);
			expect(exit).toHaveBeenCalledWith(1);
			expect(exit).toHaveBeenCalledTimes(1);
		} finally {
			jest.clearAllTimers();
			jest.useRealTimers();
		}
	});

	it("clears the deadline after shutdown completes", async () => {
		jest.useFakeTimers();
		try {
			const forceCloseServer = jest.fn();
			const shutdown = createGracefulShutdown({
				closeServer: jest.fn(async () => {}),
				forceCloseServer,
				endPool: jest.fn(async () => {}),
				exit: jest.fn(),
				logError: jest.fn(),
			});

			const run = shutdown();
			expect(jest.getTimerCount()).toBe(1);

			await run;

			expect(jest.getTimerCount()).toBe(0);
			jest.advanceTimersByTime(SHUTDOWN_DEADLINE_MS);
			expect(forceCloseServer).not.toHaveBeenCalled();
		} finally {
			jest.useRealTimers();
		}
	});

	it("does not exit twice when cleanup fails after the deadline", async () => {
		jest.useFakeTimers();
		try {
			const poolEnd = deferred<void>();
			const poolError = new Error("synthetic late Pool failure");
			const exit = jest.fn();
			const logError = jest.fn();
			const shutdown = createGracefulShutdown({
				closeServer: jest.fn(async () => {}),
				forceCloseServer: jest.fn(),
				endPool: jest.fn(() => poolEnd.promise),
				exit,
				logError,
			});

			const run = shutdown();
			await Promise.resolve();
			jest.advanceTimersByTime(SHUTDOWN_DEADLINE_MS);
			await run;

			expect(exit).toHaveBeenCalledTimes(1);
			poolEnd.reject(poolError);
			await Promise.resolve();

			expect(logError).toHaveBeenCalledWith(
				"api pool shutdown failed",
				poolError,
			);
			expect(exit).toHaveBeenCalledTimes(1);
			expect(shutdown()).toBe(run);
		} finally {
			jest.useRealTimers();
		}
	});
});
