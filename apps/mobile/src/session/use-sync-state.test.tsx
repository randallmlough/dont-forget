import { db } from "@mobile/session/powersync";
import { act, renderHook } from "@testing-library/react-native";
import { useSyncState } from "./use-sync-state";

type StatusListener = () => void;

type TestSyncStatus = {
	connected: boolean;
	connecting: boolean;
	hasSynced: boolean;
	dataFlowStatus: {
		downloading: boolean;
		uploading: boolean;
		downloadError: Error | null;
		uploadError: Error | null;
	};
};

type TestPowerSyncDb = {
	currentStatus: TestSyncStatus;
	registerListener: jest.Mock<() => void, [{ statusChanged: StatusListener }]>;
};

const testDb = db as unknown as TestPowerSyncDb;

describe("useSyncState", () => {
	beforeEach(() => {
		testDb.currentStatus = statusFixture({ connected: true, hasSynced: true });
		testDb.registerListener = jest.fn(({ statusChanged }) => {
			listeners.add(statusChanged);
			return () => listeners.delete(statusChanged);
		});
		listeners.clear();
	});

	it("returns the current sync state and updates on status changes", async () => {
		const { result } = await renderHook(() => useSyncState());

		expect(result.current).toBe("synced");
		expect(testDb.registerListener).toHaveBeenCalledTimes(1);

		await act(async () => {
			testDb.currentStatus = statusFixture({ connected: false });
			emitStatusChanged();
		});

		expect(result.current).toBe("offline");
	});

	it("unsubscribes when the hook unmounts", async () => {
		const { unmount } = await renderHook(() => useSyncState());

		expect(listeners.size).toBe(1);

		await act(async () => {
			unmount();
		});

		expect(listeners.size).toBe(0);
	});
});

const listeners = new Set<StatusListener>();

function emitStatusChanged() {
	for (const listener of listeners) {
		listener();
	}
}

function statusFixture(
	overrides: Partial<TestSyncStatus> = {},
): TestSyncStatus {
	return {
		connected: false,
		connecting: false,
		hasSynced: false,
		dataFlowStatus: {
			downloading: false,
			uploading: false,
			downloadError: null,
			uploadError: null,
		},
		...overrides,
	};
}
