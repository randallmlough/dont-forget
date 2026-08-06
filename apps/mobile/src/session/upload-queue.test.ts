import { db } from "@mobile/session/powersync";
import { uploadQueueMonitor } from "./upload-queue";

type StatusListener = () => void;

type TestSyncStatus = {
	connected: boolean;
	connecting: boolean;
	dataFlowStatus: {
		uploadError: Error | null;
	};
};

type TestPowerSyncDb = {
	currentStatus: TestSyncStatus;
	getUploadQueueStats: jest.Mock<
		Promise<{ count: number; size: number | null }>,
		[boolean]
	>;
	registerListener: jest.Mock<() => void, [{ statusChanged: StatusListener }]>;
};

const testDb = db as unknown as TestPowerSyncDb;

describe("upload queue monitor", () => {
	beforeEach(() => {
		testDb.currentStatus = statusFixture();
		testDb.getUploadQueueStats = jest.fn(async (_includeSize: boolean) => ({
			count: 3,
			size: 1024,
		}));
		testDb.registerListener = jest.fn(
			(_listener: { statusChanged: StatusListener }) => () => undefined,
		);
	});

	it("maps PowerSync upload queue stats to the app count shape", async () => {
		await expect(uploadQueueMonitor.getUploadQueueStats()).resolves.toEqual({
			count: 3,
		});

		expect(testDb.getUploadQueueStats).toHaveBeenCalledWith(false);
	});

	it("maps the current PowerSync status to the upload queue state", () => {
		testDb.currentStatus = statusFixture({
			connected: true,
			dataFlowStatus: { uploadError: new Error("upload failed") },
		});

		expect(uploadQueueMonitor.getUploadQueueState()).toEqual({
			connected: true,
			connecting: false,
			uploadError: true,
		});
	});

	it("maps PowerSync connecting status to the upload queue state", () => {
		testDb.currentStatus = statusFixture({
			connected: false,
			connecting: true,
		});

		expect(uploadQueueMonitor.getUploadQueueState()).toEqual({
			connected: false,
			connecting: true,
			uploadError: false,
		});
	});

	it("subscribes to PowerSync status changes", () => {
		const onChange = jest.fn();
		const unsubscribe = jest.fn();
		testDb.registerListener.mockReturnValue(unsubscribe);

		expect(uploadQueueMonitor.subscribe(onChange)).toBe(unsubscribe);
		expect(testDb.registerListener).toHaveBeenCalledWith({
			statusChanged: onChange,
		});
	});
});

function statusFixture(
	overrides: Partial<TestSyncStatus> = {},
): TestSyncStatus {
	return {
		connected: false,
		connecting: false,
		dataFlowStatus: {
			uploadError: null,
		},
		...overrides,
	};
}
