/**
 * Adversarial reconnect-recovery scenarios.
 *
 * Invariant under test: pending local writes reach sync() within one retry
 * interval of any plausible online signal, no matter which NetInfo sequence
 * led there. See docs/.local/discussions/sync-service-refactor-discussion-2026-06-09.md.
 */
import type { SyncNetworkStatusAdapter } from "./network-status";
import type { SyncResult } from "./sync-coordinator";
import {
	actTicks,
	actTimer,
	controllableNetworkStatus,
	createCoordinator,
	deferred,
	stopActiveCoordinators,
} from "./sync-coordinator.test-helpers";

const mockNetInfoRemove = jest.fn();
const mockAddEventListener = jest.fn();
const mockRefresh = jest.fn();

jest.mock("@react-native-community/netinfo", () => ({
	__esModule: true,
	default: {
		addEventListener: mockAddEventListener,
		refresh: mockRefresh,
	},
}));

jest.mock("@/lib/logger", () => {
	const { createMockLogger } = jest.requireActual<
		typeof import("@/lib/test/mocks/logger")
	>("@/lib/test/mocks/logger");
	return { logger: createMockLogger() };
});

type RawNetInfoState = {
	isConnected: boolean | null;
	isInternetReachable: boolean | null;
};

describe("sync coordinator reconnect recovery", () => {
	beforeEach(() => {
		mockNetInfoRemove.mockClear();
		mockAddEventListener.mockReset();
		mockRefresh.mockReset();
	});

	afterEach(stopActiveCoordinators);

	it("syncs pending local writes when NetInfo reports connected before reachability confirms", async () => {
		jest.useFakeTimers();
		const netInfo = scriptedNetInfo({
			isConnected: true,
			isInternetReachable: true,
		});
		const adapter = loadNetInfoBackedAdapter();
		const sync = jest.fn(async (): Promise<SyncResult> => ({ changed: false }));
		const coordinator = createCoordinator({
			networkStatus: adapter,
			retryIntervalMs: 100,
			sync,
		});

		try {
			coordinator.start();
			await actTicks();
			sync.mockClear();

			netInfo.emit({ isConnected: false, isInternetReachable: false });
			await actTicks();
			expect(coordinator.getStatus()).toBe("offline");

			await coordinator.requestSync({ reason: "localWrite" });
			expect(sync).not.toHaveBeenCalled();

			// The iOS NetInfo lie: connectivity returns, but the reachability
			// probe lags (and sometimes never confirms).
			netInfo.emit({ isConnected: true, isInternetReachable: false });
			await actTicks();
			await actTimer(100);

			expect(sync).toHaveBeenCalled();
			expect(coordinator.getStatus()).toBe("synced");
		} finally {
			jest.useRealTimers();
		}
	});

	it("manual refresh reaches sync while NetInfo reachability stays unconfirmed", async () => {
		const netInfo = scriptedNetInfo({
			isConnected: true,
			isInternetReachable: true,
		});
		const adapter = loadNetInfoBackedAdapter();
		const sync = jest.fn(async (): Promise<SyncResult> => ({ changed: false }));
		const coordinator = createCoordinator({
			networkStatus: adapter,
			sync,
		});

		coordinator.start();
		await actTicks();
		sync.mockClear();

		netInfo.emit({ isConnected: false, isInternetReachable: false });
		await actTicks();
		expect(coordinator.getStatus()).toBe("offline");

		// NetInfo keeps answering refresh with the lying state: connected,
		// reachability never confirmed. Pull-to-refresh must still attempt a
		// sync; the attempt itself is the authoritative reachability probe.
		netInfo.set({ isConnected: true, isInternetReachable: false });
		await coordinator.requestSync({ reason: "manualRefresh" });

		expect(sync).toHaveBeenCalledWith({ mode: "full" });
		expect(coordinator.getStatus()).toBe("synced");
	});

	it("syncs pending local writes within one retry interval after offline becomes unknown", async () => {
		jest.useFakeTimers();
		const networkStatus = controllableNetworkStatus("online");
		const sync = jest.fn(async (): Promise<SyncResult> => ({ changed: false }));
		const coordinator = createCoordinator({
			networkStatus,
			retryIntervalMs: 100,
			sync,
		});

		try {
			coordinator.start();
			await actTicks();
			sync.mockClear();

			networkStatus.emit("offline");
			expect(coordinator.getStatus()).toBe("offline");

			await coordinator.requestSync({ reason: "localWrite" });
			expect(sync).not.toHaveBeenCalled();

			// Interface churn: NetInfo can only say "unknown", never emits a
			// clean offline -> online transition.
			networkStatus.emit("unknown");
			await actTimer(100);

			expect(sync).toHaveBeenCalledWith({ mode: "pushLocalOnly" });
			expect(coordinator.getStatus()).toBe("synced");
		} finally {
			jest.useRealTimers();
		}
	});

	it("runs a follow-up full sync when the network flaps during an in-flight sync", async () => {
		const networkStatus = controllableNetworkStatus("online");
		const inFlightAttempt = deferred<SyncResult>();
		const sync = jest.fn(async (): Promise<SyncResult> => ({ changed: false }));
		const coordinator = createCoordinator({
			networkStatus,
			sync,
		});

		coordinator.start();
		await actTicks();
		sync.mockClear();
		sync.mockImplementationOnce(() => inFlightAttempt.promise);

		const request = coordinator.requestSync({ reason: "localWrite" });
		await actTicks();
		expect(coordinator.getStatus()).toBe("pending");

		networkStatus.emit("offline");
		networkStatus.emit("online");
		await actTicks();

		inFlightAttempt.resolve({ changed: false });
		await request;
		await actTicks();

		expect(sync).toHaveBeenLastCalledWith({ mode: "full" });
		expect(coordinator.getStatus()).toBe("synced");
	});
});

function scriptedNetInfo(initialState: RawNetInfoState): {
	set: (state: RawNetInfoState) => void;
	emit: (state: RawNetInfoState) => void;
} {
	let currentState = initialState;
	let netInfoListener: ((state: RawNetInfoState) => void) | null = null;

	mockAddEventListener.mockImplementation(
		(listener: (state: RawNetInfoState) => void) => {
			netInfoListener = listener;
			return mockNetInfoRemove;
		},
	);
	mockRefresh.mockImplementation(async () => currentState);

	return {
		set(state) {
			currentState = state;
		},
		emit(state) {
			currentState = state;
			if (!netInfoListener) {
				throw new Error("NetInfo listener was not registered");
			}
			netInfoListener(state);
		},
	};
}

function loadNetInfoBackedAdapter(): SyncNetworkStatusAdapter {
	let adapter: SyncNetworkStatusAdapter | null = null;
	jest.isolateModules(() => {
		const networkStatusModule =
			jest.requireActual<typeof import("./network-status")>("./network-status");
		adapter = networkStatusModule.getDefaultSyncNetworkStatusAdapter();
	});
	if (!adapter) {
		throw new Error("Unable to load NetInfo-backed network status adapter");
	}
	return adapter;
}
