import type { HouseholdSyncResult } from "./household-store";
import {
	createHouseholdSyncCoordinator,
	type HouseholdSyncAppStateAdapter,
	type HouseholdSyncCoordinator,
	type HouseholdSyncStatus,
} from "./household-sync-coordinator";

const activeCoordinators: HouseholdSyncCoordinator[] = [];

describe("createHouseholdSyncCoordinator", () => {
	afterEach(() => {
		for (const coordinator of activeCoordinators) {
			coordinator.stop();
		}
		activeCoordinators.length = 0;
		jest.useRealTimers();
	});

	it("uses push-local-only sync for local Item write requests", async () => {
		const sync = jest.fn(async () => ({ changed: false }));
		const coordinator = createCoordinator({ sync });

		await coordinator.requestSync({ reason: "localWrite" });

		expect(sync).toHaveBeenCalledWith({ mode: "pushLocalOnly" });
		expect(coordinator.getStatus()).toBe("synced");
	});

	it("uses full sync behavior for manual refresh requests", async () => {
		const sync = jest.fn(async () => ({ changed: true }));
		const coordinator = createCoordinator({ sync });

		await expect(
			coordinator.requestSync({ reason: "manualRefresh" }),
		).resolves.toEqual({ changed: true });

		expect(sync).toHaveBeenCalledWith({ mode: "full" });
	});

	it("keeps local Item write requests push-local-only after manual refresh", async () => {
		const sync = jest.fn(async () => ({ changed: false }));
		const coordinator = createCoordinator({ sync });

		await coordinator.requestSync({ reason: "manualRefresh" });
		await coordinator.requestSync({ reason: "localWrite" });

		expect(sync).toHaveBeenNthCalledWith(1, { mode: "full" });
		expect(sync).toHaveBeenNthCalledWith(2, { mode: "pushLocalOnly" });
	});

	it("coalesces local write requests that arrive during an in-flight sync", async () => {
		const firstSync = deferred<HouseholdSyncResult>();
		const sync = jest
			.fn<
				Promise<HouseholdSyncResult>,
				[{ mode?: "full" | "pushLocalOnly" }?]
			>()
			.mockReturnValueOnce(firstSync.promise)
			.mockResolvedValue({ changed: false });
		const coordinator = createCoordinator({ sync });

		const firstRequest = coordinator.requestSync({ reason: "localWrite" });
		const secondRequest = coordinator.requestSync({ reason: "localWrite" });
		await Promise.resolve();

		expect(sync).toHaveBeenCalledTimes(1);

		firstSync.resolve({ changed: false });
		await Promise.all([firstRequest, secondRequest]);

		expect(sync).toHaveBeenCalledTimes(2);
		expect(sync).toHaveBeenLastCalledWith({ mode: "pushLocalOnly" });
	});

	it("preserves a queued manual refresh as a full follow-up sync", async () => {
		const firstSync = deferred<HouseholdSyncResult>();
		const sync = jest
			.fn<
				Promise<HouseholdSyncResult>,
				[{ mode?: "full" | "pushLocalOnly" }?]
			>()
			.mockReturnValueOnce(firstSync.promise)
			.mockResolvedValue({ changed: false });
		const coordinator = createCoordinator({ sync });

		const firstRequest = coordinator.requestSync({ reason: "localWrite" });
		const refreshRequest = coordinator.requestSync({ reason: "manualRefresh" });
		await Promise.resolve();

		expect(sync).toHaveBeenCalledTimes(1);

		firstSync.resolve({ changed: false });
		await Promise.all([firstRequest, refreshRequest]);

		expect(sync).toHaveBeenCalledTimes(2);
		expect(sync).toHaveBeenLastCalledWith({ mode: "full" });
	});

	it("keeps status pending until a queued follow-up sync completes", async () => {
		const firstSync = deferred<HouseholdSyncResult>();
		const followUpSync = deferred<HouseholdSyncResult>();
		const sync = jest
			.fn<
				Promise<HouseholdSyncResult>,
				[{ mode?: "full" | "pushLocalOnly" }?]
			>()
			.mockReturnValueOnce(firstSync.promise)
			.mockReturnValueOnce(followUpSync.promise);
		const coordinator = createCoordinator({ sync });
		const statuses: HouseholdSyncStatus[] = [];
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
		const firstSync = deferred<HouseholdSyncResult>();
		const followUpSync = deferred<HouseholdSyncResult>();
		const sync = jest
			.fn<
				Promise<HouseholdSyncResult>,
				[{ mode?: "full" | "pushLocalOnly" }?]
			>()
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

	it("transitions network-unavailable failures to offline without error logging", async () => {
		const logger = loggerFixture();
		const coordinator = createCoordinator({
			logger,
			sync: jest.fn(async () => {
				throw new TypeError("Network request failed");
			}),
		});

		await coordinator.requestSync({ reason: "localWrite" });

		expect(coordinator.getStatus()).toBe("offline");
		expect(logger.error).not.toHaveBeenCalled();
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
		expect(logger.error).toHaveBeenCalledWith("household sync failed", {
			error: syncError,
			reason: "manualRefresh",
		});
	});

	it("retries pending sync while foregrounded and stops retry work on stop", async () => {
		jest.useFakeTimers();
		const sync = jest
			.fn<
				Promise<HouseholdSyncResult>,
				[{ mode?: "full" | "pushLocalOnly" }?]
			>()
			.mockRejectedValueOnce(new TypeError("Network request failed"))
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

	it("notifies subscribers of coordinator-owned status changes", async () => {
		const statuses: HouseholdSyncStatus[] = [];
		const sync = jest.fn(async () => ({ changed: false }));
		const coordinator = createCoordinator({ sync });
		const subscription = coordinator.subscribe((status) =>
			statuses.push(status),
		);

		await coordinator.requestSync({ reason: "localWrite" });
		subscription.remove();

		expect(statuses).toEqual(["pending", "synced"]);
	});
});

function createCoordinator(
	overrides: Partial<Parameters<typeof createHouseholdSyncCoordinator>[0]> = {},
) {
	const coordinator = createHouseholdSyncCoordinator({
		syncAuthorized: true,
		sync: jest.fn(async () => ({ changed: false })),
		appState: memoryAppState("active"),
		logger: loggerFixture(),
		...overrides,
	});
	activeCoordinators.push(coordinator);
	return coordinator;
}

function memoryAppState(initialState: string): HouseholdSyncAppStateAdapter {
	return {
		getCurrentState() {
			return initialState;
		},
		subscribe() {
			return { remove() {} };
		},
	};
}

function loggerFixture() {
	return {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		with: jest.fn(),
	};
}

function deferred<T>() {
	let resolve: ((value: T) => void) | undefined;
	let reject: ((error: Error) => void) | undefined;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});
	if (!resolve || !reject) {
		throw new Error("Unable to create deferred promise");
	}

	return { promise, resolve, reject };
}

async function actTicks() {
	await Promise.resolve();
	await Promise.resolve();
}

async function actTimer(ms: number) {
	jest.advanceTimersByTime(ms);
	await actTicks();
}
