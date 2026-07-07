import { db } from "@/client/session/powersync";
import {
	getUploadQueueState,
	getUploadQueueStats,
	subscribeUploadQueueChanges,
} from "./upload-queue";

type StatusListener = () => void;

type TestSyncStatus = {
	connected: boolean;
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
		await expect(getUploadQueueStats()).resolves.toEqual({ count: 3 });

		expect(testDb.getUploadQueueStats).toHaveBeenCalledWith(false);
	});

	it("maps the current PowerSync status to the upload queue state", () => {
		testDb.currentStatus = statusFixture({
			connected: true,
			dataFlowStatus: { uploadError: new Error("upload failed") },
		});

		expect(getUploadQueueState()).toEqual({
			connected: true,
			uploadError: true,
		});
	});

	it("subscribes to PowerSync status changes", () => {
		const onChange = jest.fn();
		const unsubscribe = jest.fn();
		testDb.registerListener.mockReturnValue(unsubscribe);

		expect(subscribeUploadQueueChanges(onChange)).toBe(unsubscribe);
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
		dataFlowStatus: {
			uploadError: null,
		},
		...overrides,
	};
}
