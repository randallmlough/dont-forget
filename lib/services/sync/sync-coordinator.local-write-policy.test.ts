import type { SyncResult } from "./sync-coordinator";
import {
	createCoordinator,
	loggerFixture,
	memoryNetworkStatus,
	refreshableNetworkStatus,
	stopActiveCoordinators,
} from "./sync-coordinator.test-helpers";
import { SyncInterruptedError } from "./sync-errors";

describe("createSyncCoordinator local write policy", () => {
	afterEach(stopActiveCoordinators);

	it("uses push-local-only sync for local Item write requests", async () => {
		const sync = jest.fn(async () => ({ changed: false }));
		const coordinator = createCoordinator({ sync });

		await coordinator.requestSync({ reason: "localWrite" });

		expect(sync).toHaveBeenCalledWith({ mode: "pushLocalOnly" });
		expect(coordinator.getStatus()).toBe("synced");
	});

	it("keeps local Item write requests push-local-only after manual refresh", async () => {
		const sync = jest.fn(async () => ({ changed: false }));
		const coordinator = createCoordinator({ sync });

		await coordinator.requestSync({ reason: "manualRefresh" });
		await coordinator.requestSync({ reason: "localWrite" });

		expect(sync).toHaveBeenNthCalledWith(1, { mode: "full" });
		expect(sync).toHaveBeenNthCalledWith(2, { mode: "pushLocalOnly" });
	});

	it("does not call sync for local Item write requests while the network is known offline", async () => {
		const sync = jest.fn(async () => ({ changed: false }));
		const coordinator = createCoordinator({
			networkStatus: memoryNetworkStatus("offline"),
			sync,
		});

		await expect(
			coordinator.requestSync({ reason: "localWrite" }),
		).resolves.toBeNull();

		expect(sync).not.toHaveBeenCalled();
		expect(coordinator.getStatus()).toBe("offline");
	});

	it("does not refresh or sync local Item write requests while coordinator status is already offline", async () => {
		const logger = loggerFixture();
		const networkStatus = refreshableNetworkStatus("online", "online");
		const sync = jest
			.fn<Promise<SyncResult>, [{ mode?: "full" | "pushLocalOnly" }?]>()
			.mockRejectedValueOnce(syncInterruptedError())
			.mockResolvedValue({ changed: false });
		const coordinator = createCoordinator({
			logger,
			networkStatus,
			sync,
		});

		await coordinator.requestSync({ reason: "localWrite" });
		expect(coordinator.getStatus()).toBe("offline");

		sync.mockClear();
		networkStatus.refreshCurrentStatus.mockClear();
		logger.error.mockClear();

		await expect(
			coordinator.requestSync({ reason: "localWrite" }),
		).resolves.toBeNull();

		expect(networkStatus.refreshCurrentStatus).not.toHaveBeenCalled();
		expect(sync).not.toHaveBeenCalled();
		expect(logger.error).not.toHaveBeenCalled();
		expect(coordinator.getStatus()).toBe("offline");
	});

	it("keeps skipped local Item write work eligible for later recovery sync", async () => {
		const networkStatus = refreshableNetworkStatus("online", "online");
		const sync = jest
			.fn<Promise<SyncResult>, [{ mode?: "full" | "pushLocalOnly" }?]>()
			.mockRejectedValueOnce(syncInterruptedError())
			.mockResolvedValue({ changed: true });
		const coordinator = createCoordinator({
			networkStatus,
			sync,
		});

		await coordinator.requestSync({ reason: "localWrite" });
		expect(coordinator.getStatus()).toBe("offline");

		sync.mockClear();
		networkStatus.refreshCurrentStatus.mockClear();

		await expect(
			coordinator.requestSync({ reason: "localWrite" }),
		).resolves.toBeNull();
		expect(sync).not.toHaveBeenCalled();

		await expect(
			coordinator.requestSync({ reason: "networkReconnect" }),
		).resolves.toEqual({ changed: true });

		expect(networkStatus.refreshCurrentStatus).toHaveBeenCalledTimes(1);
		expect(sync).toHaveBeenCalledTimes(1);
		expect(sync).toHaveBeenCalledWith({ mode: "full" });
		expect(coordinator.getStatus()).toBe("synced");
	});
});

function syncInterruptedError() {
	return new SyncInterruptedError(
		"networkUnavailable",
		new TypeError("Network request failed"),
	);
}
