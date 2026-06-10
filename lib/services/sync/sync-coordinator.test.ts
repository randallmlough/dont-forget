import { SyncInterruptedError } from "@/db/household-store";
import type { SyncResult, SyncStatus } from "./sync-coordinator";
import {
	actTicks,
	actTimer,
	controllableAppState,
	controllableNetworkStatus,
	createCoordinator,
	deferred,
	loggerFixture,
	memoryAppState,
	memoryNetworkStatus,
	mutableAppState,
	refreshableNetworkStatus,
	stopActiveCoordinators,
} from "./sync-coordinator.test-helpers";

describe("createSyncCoordinator", () => {
	afterEach(stopActiveCoordinators);

	it("uses full sync behavior for manual refresh requests", async () => {
		const sync = jest.fn(async () => ({ changed: true }));
		const coordinator = createCoordinator({ sync });

		await expect(
			coordinator.requestSync({ reason: "manualRefresh" }),
		).resolves.toEqual({ changed: true });

		expect(sync).toHaveBeenCalledWith({ mode: "full" });
	});

	it("uses full sync behavior for app foreground catch-up requests", async () => {
		const sync = jest.fn(async () => ({ changed: true }));
		const coordinator = createCoordinator({ sync });

		await expect(
			coordinator.requestSync({ reason: "appForeground" }),
		).resolves.toEqual({ changed: true });

		expect(sync).toHaveBeenCalledWith({ mode: "full" });
	});

	it("coalesces local write requests that arrive during an in-flight sync", async () => {
		const firstSync = deferred<SyncResult>();
		const sync = jest
			.fn<Promise<SyncResult>, [{ mode?: "full" | "pushLocalOnly" }?]>()
			.mockReturnValueOnce(firstSync.promise)
			.mockResolvedValue({ changed: false });
		const coordinator = createCoordinator({ sync });

		const firstRequest = coordinator.requestSync({ reason: "localWrite" });
		const secondRequest = coordinator.requestSync({ reason: "localWrite" });
		await actTicks();

		expect(sync).toHaveBeenCalledTimes(1);

		firstSync.resolve({ changed: false });
		await Promise.all([firstRequest, secondRequest]);

		expect(sync).toHaveBeenCalledTimes(2);
		expect(sync).toHaveBeenLastCalledWith({ mode: "pushLocalOnly" });
	});

	it("preserves a queued manual refresh as a full follow-up sync", async () => {
		const firstSync = deferred<SyncResult>();
		const sync = jest
			.fn<Promise<SyncResult>, [{ mode?: "full" | "pushLocalOnly" }?]>()
			.mockReturnValueOnce(firstSync.promise)
			.mockResolvedValue({ changed: false });
		const coordinator = createCoordinator({ sync });

		const firstRequest = coordinator.requestSync({ reason: "localWrite" });
		const refreshRequest = coordinator.requestSync({ reason: "manualRefresh" });
		await actTicks();

		expect(sync).toHaveBeenCalledTimes(1);

		firstSync.resolve({ changed: false });
		await Promise.all([firstRequest, refreshRequest]);

		expect(sync).toHaveBeenCalledTimes(2);
		expect(sync).toHaveBeenLastCalledWith({ mode: "full" });
	});

	it("preserves a queued manual refresh when the in-flight local write sync fails", async () => {
		const logger = loggerFixture();
		const firstSync = deferred<SyncResult>();
		const syncError = new Error("push failed");
		const sync = jest
			.fn<Promise<SyncResult>, [{ mode?: "full" | "pushLocalOnly" }?]>()
			.mockReturnValueOnce(firstSync.promise)
			.mockResolvedValueOnce({ changed: true });
		const coordinator = createCoordinator({ logger, sync });

		const firstRequest = coordinator.requestSync({ reason: "localWrite" });
		const refreshRequest = coordinator.requestSync({ reason: "manualRefresh" });
		await actTicks();

		expect(sync).toHaveBeenCalledTimes(1);

		firstSync.reject(syncError);
		await expect(refreshRequest).resolves.toEqual({ changed: true });
		await expect(firstRequest).resolves.toEqual({ changed: true });

		expect(sync).toHaveBeenCalledTimes(2);
		expect(sync).toHaveBeenLastCalledWith({ mode: "full" });
		expect(coordinator.getStatus()).toBe("synced");
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith("household sync failed", {
			error: syncError,
			reason: "localWrite",
		});
	});

	it("rejects a queued manual refresh when the follow-up full sync fails", async () => {
		const logger = loggerFixture();
		const firstSync = deferred<SyncResult>();
		const syncError = new Error("remote unavailable");
		const sync = jest
			.fn<Promise<SyncResult>, [{ mode?: "full" | "pushLocalOnly" }?]>()
			.mockReturnValueOnce(firstSync.promise)
			.mockRejectedValueOnce(syncError);
		const coordinator = createCoordinator({ logger, sync });

		const firstRequest = coordinator.requestSync({ reason: "localWrite" });
		const refreshRequest = coordinator.requestSync({ reason: "manualRefresh" });
		await actTicks();

		firstSync.resolve({ changed: false });

		await expect(refreshRequest).rejects.toThrow(syncError);
		await expect(firstRequest).rejects.toThrow(syncError);
		expect(coordinator.getStatus()).toBe("failed");
		expect(logger.error).toHaveBeenCalledWith("household sync failed", {
			error: syncError,
			reason: "manualRefresh",
		});
	});

	it("keeps status pending until a queued follow-up sync completes", async () => {
		const firstSync = deferred<SyncResult>();
		const followUpSync = deferred<SyncResult>();
		const sync = jest
			.fn<Promise<SyncResult>, [{ mode?: "full" | "pushLocalOnly" }?]>()
			.mockReturnValueOnce(firstSync.promise)
			.mockReturnValueOnce(followUpSync.promise);
		const coordinator = createCoordinator({ sync });
		const statuses: SyncStatus[] = [];
		const subscription = coordinator.subscribe((status) =>
			statuses.push(status),
		);

		const firstRequest = coordinator.requestSync({ reason: "localWrite" });
		const queuedRequest = coordinator.requestSync({ reason: "localWrite" });
		await actTicks();

		expect(statuses).toEqual(["pending"]);
		expect(sync).toHaveBeenCalledTimes(1);

		firstSync.resolve({ changed: false });
		await actTicks();

		expect(sync).toHaveBeenCalledTimes(2);
		expect(coordinator.getStatus()).toBe("pending");
		expect(statuses).toEqual(["pending"]);

		followUpSync.resolve({ changed: false });
		await Promise.all([firstRequest, queuedRequest]);
		subscription.remove();

		expect(coordinator.getStatus()).toBe("synced");
		expect(statuses).toEqual(["pending", "synced"]);
	});

	it("serializes requests that arrive during a queued follow-up sync", async () => {
		const firstSync = deferred<SyncResult>();
		const followUpSync = deferred<SyncResult>();
		const sync = jest
			.fn<Promise<SyncResult>, [{ mode?: "full" | "pushLocalOnly" }?]>()
			.mockReturnValueOnce(firstSync.promise)
			.mockReturnValueOnce(followUpSync.promise)
			.mockResolvedValue({ changed: false });
		const coordinator = createCoordinator({ sync });

		const firstRequest = coordinator.requestSync({ reason: "localWrite" });
		const refreshRequest = coordinator.requestSync({ reason: "manualRefresh" });
		await actTicks();

		expect(sync).toHaveBeenCalledTimes(1);

		firstSync.resolve({ changed: false });
		await actTicks();

		expect(sync).toHaveBeenCalledTimes(2);
		expect(sync).toHaveBeenLastCalledWith({ mode: "full" });

		const writeDuringFollowUp = coordinator.requestSync({
			reason: "localWrite",
		});
		await actTicks();

		expect(sync).toHaveBeenCalledTimes(2);

		followUpSync.resolve({ changed: false });
		await Promise.all([firstRequest, refreshRequest, writeDuringFollowUp]);

		expect(sync).toHaveBeenCalledTimes(3);
		expect(sync).toHaveBeenLastCalledWith({ mode: "pushLocalOnly" });
		expect(coordinator.getStatus()).toBe("synced");
	});

	it("runs a queued local write follow-up before rethrowing a manual refresh failure", async () => {
		const logger = loggerFixture();
		const refreshSync = deferred<SyncResult>();
		const refreshError = new Error("refresh failed");
		const sync = jest
			.fn<Promise<SyncResult>, [{ mode?: "full" | "pushLocalOnly" }?]>()
			.mockReturnValueOnce(refreshSync.promise)
			.mockResolvedValue({ changed: false });
		const coordinator = createCoordinator({ logger, sync });

		const refreshRequest = coordinator.requestSync({ reason: "manualRefresh" });
		const writeRequest = coordinator.requestSync({ reason: "localWrite" });
		await actTicks();

		expect(sync).toHaveBeenCalledTimes(1);
		expect(sync).toHaveBeenLastCalledWith({ mode: "full" });

		refreshSync.reject(refreshError);

		await expect(
			Promise.allSettled([refreshRequest, writeRequest]),
		).resolves.toEqual([
			{ reason: refreshError, status: "rejected" },
			{ reason: refreshError, status: "rejected" },
		]);

		expect(sync).toHaveBeenCalledTimes(2);
		expect(sync).toHaveBeenLastCalledWith({ mode: "pushLocalOnly" });
		expect(coordinator.getStatus()).toBe("failed");
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith("household sync failed", {
			error: refreshError,
			reason: "manualRefresh",
		});

		sync.mockClear();
		await coordinator.requestSync({ reason: "manualRefresh" });

		expect(sync).toHaveBeenCalledTimes(1);
		expect(sync).toHaveBeenLastCalledWith({ mode: "full" });
	});

	it("transitions typed sync interruptions to offline without error logging", async () => {
		const logger = loggerFixture();
		const coordinator = createCoordinator({
			logger,
			sync: jest.fn(async () => {
				throw syncInterruptedError();
			}),
		});

		await coordinator.requestSync({ reason: "localWrite" });

		expect(coordinator.getStatus()).toBe("offline");
		expect(logger.error).not.toHaveBeenCalled();
	});

	it("refreshes stale online network status before starting sync work", async () => {
		const sync = jest.fn(async () => ({ changed: false }));
		const networkStatus = refreshableNetworkStatus("online", "offline");
		const coordinator = createCoordinator({
			networkStatus,
			sync,
		});

		await expect(
			coordinator.requestSync({ reason: "manualRefresh" }),
		).resolves.toBeNull();

		expect(networkStatus.refreshCurrentStatus).toHaveBeenCalledTimes(1);
		expect(sync).not.toHaveBeenCalled();
		expect(coordinator.getStatus()).toBe("offline");
	});

	it("does not call sync for retry or manual refresh requests while the network is known offline", async () => {
		const sync = jest.fn(async () => ({ changed: false }));
		const coordinator = createCoordinator({
			networkStatus: memoryNetworkStatus("offline"),
			sync,
		});

		await expect(
			coordinator.requestSync({ reason: "retry" }),
		).resolves.toBeNull();
		await expect(
			coordinator.requestSync({ reason: "manualRefresh" }),
		).resolves.toBeNull();

		expect(sync).not.toHaveBeenCalled();
		expect(coordinator.getStatus()).toBe("offline");
	});

	it("refreshes stale offline network status before skipping foreground catch-up sync", async () => {
		const sync = jest.fn(async () => ({ changed: true }));
		const networkStatus = refreshableNetworkStatus("offline", "online");
		const coordinator = createCoordinator({
			networkStatus,
			sync,
		});

		await expect(
			coordinator.requestSync({ reason: "appForeground" }),
		).resolves.toEqual({ changed: true });

		expect(networkStatus.refreshCurrentStatus).toHaveBeenCalledTimes(1);
		expect(sync).toHaveBeenCalledWith({ mode: "full" });
		expect(coordinator.getStatus()).toBe("synced");
	});

	it("refreshes stale offline network status before skipping startup retry sync", async () => {
		const sync = jest.fn(async () => ({ changed: false }));
		const networkStatus = refreshableNetworkStatus("offline", "online");
		const coordinator = createCoordinator({
			networkStatus,
			sync,
		});

		coordinator.start();
		await actTicks();

		expect(networkStatus.refreshCurrentStatus).toHaveBeenCalledTimes(1);
		expect(sync).toHaveBeenCalledWith({ mode: "pushLocalOnly" });
		expect(coordinator.getStatus()).toBe("synced");
	});

	it("transitions offline and stops retry attempts when the network becomes known offline", async () => {
		jest.useFakeTimers();
		const networkStatus = controllableNetworkStatus("unknown");
		const sync = jest.fn(async () => ({ changed: false }));
		const coordinator = createCoordinator({
			networkStatus,
			retryIntervalMs: 100,
			sync,
		});

		try {
			coordinator.start();
			await actTicks();
			expect(sync).toHaveBeenCalledTimes(1);

			networkStatus.emit("offline");
			expect(coordinator.getStatus()).toBe("offline");
			await actTimer(100);

			expect(sync).toHaveBeenCalledTimes(1);
		} finally {
			jest.useRealTimers();
		}
	});

	it("does not start retry sync work while the network is already known offline", async () => {
		jest.useFakeTimers();
		const sync = jest.fn(async () => ({ changed: false }));
		const coordinator = createCoordinator({
			networkStatus: memoryNetworkStatus("offline"),
			retryIntervalMs: 100,
			sync,
		});

		try {
			coordinator.start();
			await actTimer(100);

			expect(sync).not.toHaveBeenCalled();
			expect(coordinator.getStatus()).toBe("offline");
		} finally {
			jest.useRealTimers();
		}
	});

	it("keeps offline status when in-flight sync succeeds after the network goes offline", async () => {
		const networkStatus = controllableNetworkStatus("online");
		const syncAttempt = deferred<SyncResult>();
		const sync = jest.fn(() => syncAttempt.promise);
		const coordinator = createCoordinator({
			appState: memoryAppState("inactive"),
			networkStatus,
			sync,
		});
		coordinator.start();

		const request = coordinator.requestSync({ reason: "manualRefresh" });
		await actTicks();

		expect(coordinator.getStatus()).toBe("pending");
		networkStatus.emit("offline");
		expect(coordinator.getStatus()).toBe("offline");

		syncAttempt.resolve({ changed: false });
		await expect(request).resolves.toEqual({ changed: false });

		expect(coordinator.getStatus()).toBe("offline");
	});

	it("runs a full Household catch-up sync when network status becomes online", async () => {
		const appState = mutableAppState("inactive");
		const networkStatus = controllableNetworkStatus("unknown");
		const sync = jest.fn(async () => ({ changed: true }));
		const coordinator = createCoordinator({
			appState,
			networkStatus,
			sync,
		});
		coordinator.start();

		appState.setState("active");
		networkStatus.emit("online");
		await actTicks();

		expect(sync).toHaveBeenCalledTimes(1);
		expect(sync).toHaveBeenCalledWith({ mode: "full" });
		expect(coordinator.getStatus()).toBe("synced");
	});

	it("waits for active app state before running network reconnect catch-up sync", async () => {
		const appState = controllableAppState("inactive");
		const networkStatus = controllableNetworkStatus("unknown");
		const sync = jest.fn(async () => ({ changed: true }));
		const coordinator = createCoordinator({
			appState,
			networkStatus,
			sync,
		});
		coordinator.start();

		networkStatus.emit("online");
		await actTicks();

		expect(sync).not.toHaveBeenCalled();

		appState.emit("active");
		await actTicks();

		expect(sync).toHaveBeenCalledTimes(1);
		expect(sync).toHaveBeenCalledWith({ mode: "full" });
	});

	it("ignores repeated online network status while already online", async () => {
		const networkStatus = controllableNetworkStatus("online");
		const sync = jest.fn(async () => ({ changed: false }));
		const coordinator = createCoordinator({
			appState: memoryAppState("inactive"),
			networkStatus,
			sync,
		});
		coordinator.start();

		networkStatus.emit("online");
		await actTicks();

		expect(sync).not.toHaveBeenCalled();
		expect(coordinator.getStatus()).toBe("synced");
	});

	it("coalesces flapping online transitions without overlapping sync attempts", async () => {
		const appState = mutableAppState("inactive");
		const networkStatus = controllableNetworkStatus("unknown");
		const firstSync = deferred<SyncResult>();
		const sync = jest
			.fn<Promise<SyncResult>, [{ mode?: "full" | "pushLocalOnly" }?]>()
			.mockReturnValueOnce(firstSync.promise)
			.mockResolvedValue({ changed: false });
		const coordinator = createCoordinator({
			appState,
			networkStatus,
			sync,
		});
		coordinator.start();

		appState.setState("active");
		networkStatus.emit("online");
		await actTicks();
		networkStatus.emit("offline");
		networkStatus.emit("online");
		await actTicks();

		expect(sync).toHaveBeenCalledTimes(1);

		firstSync.resolve({ changed: false });
		await actTicks();

		expect(sync).toHaveBeenCalledTimes(2);
		expect(sync).toHaveBeenLastCalledWith({ mode: "full" });
	});

	it("prioritizes a queued network reconnect over a local Item write follow-up", async () => {
		const appState = mutableAppState("inactive");
		const networkStatus = controllableNetworkStatus("unknown");
		const firstSync = deferred<SyncResult>();
		const sync = jest
			.fn<Promise<SyncResult>, [{ mode?: "full" | "pushLocalOnly" }?]>()
			.mockReturnValueOnce(firstSync.promise)
			.mockResolvedValue({ changed: false });
		const coordinator = createCoordinator({
			appState,
			networkStatus,
			sync,
		});
		coordinator.start();

		const writeRequest = coordinator.requestSync({ reason: "localWrite" });
		await actTicks();
		appState.setState("active");
		networkStatus.emit("online");
		await actTicks();

		expect(sync).toHaveBeenCalledTimes(1);
		expect(sync).toHaveBeenLastCalledWith({ mode: "pushLocalOnly" });

		firstSync.resolve({ changed: false });
		await writeRequest;

		expect(sync).toHaveBeenCalledTimes(2);
		expect(sync).toHaveBeenLastCalledWith({ mode: "full" });
	});

	it("logs and rethrows unexpected manual refresh failures", async () => {
		const logger = loggerFixture();
		const syncError = new Error("remote unavailable");
		const coordinator = createCoordinator({
			logger,
			sync: jest.fn(async () => {
				throw syncError;
			}),
		});

		await expect(
			coordinator.requestSync({ reason: "manualRefresh" }),
		).rejects.toThrow(syncError);

		expect(coordinator.getStatus()).toBe("failed");
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith("household sync failed", {
			error: syncError,
			reason: "manualRefresh",
		});
	});

	it("retries pending sync while foregrounded and stops retry work on stop", async () => {
		jest.useFakeTimers();
		const sync = jest
			.fn<Promise<SyncResult>, [{ mode?: "full" | "pushLocalOnly" }?]>()
			.mockRejectedValueOnce(syncInterruptedError())
			.mockResolvedValue({ changed: false });
		const coordinator = createCoordinator({ sync });

		try {
			await coordinator.requestSync({ reason: "localWrite" });
			expect(coordinator.getStatus()).toBe("offline");

			coordinator.start();
			await actTicks();
			expect(sync).toHaveBeenCalledTimes(2);

			await actTimer(30_000);
			expect(sync).toHaveBeenCalledTimes(2);

			coordinator.stop();
			await actTimer(30_000);
			expect(sync).toHaveBeenCalledTimes(2);
		} finally {
			jest.useRealTimers();
		}
	});

	it("pauses retry work while inactive and resumes through foreground lifecycle", async () => {
		jest.useFakeTimers();
		const appState = controllableAppState("inactive");
		const logger = loggerFixture();
		const foregroundError = new Error("foreground failed");
		const retryError = new Error("retry failed");
		const sync = jest
			.fn<Promise<SyncResult>, [{ mode?: "full" | "pushLocalOnly" }?]>()
			.mockRejectedValueOnce(syncInterruptedError())
			.mockRejectedValueOnce(foregroundError)
			.mockRejectedValueOnce(retryError);
		const coordinator = createCoordinator({ appState, logger, sync });

		try {
			await coordinator.requestSync({ reason: "localWrite" });
			expect(coordinator.getStatus()).toBe("offline");

			coordinator.start();
			await actTimer(30_000);
			expect(sync).toHaveBeenCalledTimes(1);

			appState.emit("active");
			await actTicks();

			expect(sync).toHaveBeenCalledTimes(2);
			expect(sync).toHaveBeenLastCalledWith({ mode: "full" });
			expect(logger.error).toHaveBeenCalledWith("household sync failed", {
				error: foregroundError,
				reason: "appForeground",
			});

			await actTimer(30_000);

			expect(sync).toHaveBeenCalledTimes(3);
			expect(sync).toHaveBeenLastCalledWith({ mode: "pushLocalOnly" });
			expect(logger.error).toHaveBeenCalledWith("household sync failed", {
				error: retryError,
				reason: "retry",
			});

			appState.emit("inactive");
			await actTimer(30_000);

			expect(sync).toHaveBeenCalledTimes(3);
		} finally {
			jest.useRealTimers();
		}
	});

	it("notifies subscribers of coordinator-owned status changes", async () => {
		const statuses: SyncStatus[] = [];
		const sync = jest.fn(async () => ({ changed: false }));
		const coordinator = createCoordinator({ sync });
		const subscription = coordinator.subscribe((status) =>
			statuses.push(status),
		);

		await coordinator.requestSync({ reason: "localWrite" });
		subscription.remove();

		expect(statuses).toEqual(["pending", "synced"]);
	});

	it("ignores an in-flight sync completion after stop", async () => {
		const syncAttempt = deferred<SyncResult>();
		const sync = jest.fn(() => syncAttempt.promise);
		const coordinator = createCoordinator({ sync });
		const statuses: SyncStatus[] = [];
		const subscription = coordinator.subscribe((status) =>
			statuses.push(status),
		);

		const request = coordinator.requestSync({ reason: "manualRefresh" });
		await actTicks();

		coordinator.stop();
		syncAttempt.resolve({ changed: true });

		await expect(request).resolves.toBeNull();
		subscription.remove();

		expect(statuses).toEqual(["pending"]);
	});

	it("waits for in-flight sync work when stopping", async () => {
		const syncAttempt = deferred<SyncResult>();
		const sync = jest.fn(() => syncAttempt.promise);
		const coordinator = createCoordinator({ sync });

		const request = coordinator.requestSync({ reason: "localWrite" });
		await actTicks();

		let stopped = false;
		const stopRequest = coordinator.stop().then(() => {
			stopped = true;
		});
		await actTicks();

		expect(stopped).toBe(false);

		syncAttempt.resolve({ changed: false });
		await expect(stopRequest).resolves.toBeUndefined();
		await expect(request).resolves.toBeNull();
		expect(stopped).toBe(true);
	});

	it("ignores stale sync completion after stop and restart", async () => {
		const syncAttempt = deferred<SyncResult>();
		const sync = jest.fn(() => syncAttempt.promise);
		const coordinator = createCoordinator({ sync });
		const statuses: SyncStatus[] = [];
		const subscription = coordinator.subscribe((status) =>
			statuses.push(status),
		);

		const request = coordinator.requestSync({ reason: "manualRefresh" });
		await actTicks();

		const stopRequest = coordinator.stop();
		coordinator.start();
		syncAttempt.resolve({ changed: true });

		await expect(stopRequest).resolves.toBeUndefined();
		await expect(request).resolves.toBeNull();
		subscription.remove();

		expect(statuses).toEqual(["pending"]);
	});
});

function syncInterruptedError() {
	return new SyncInterruptedError(
		"networkUnavailable",
		new TypeError("Network request failed"),
	);
}
