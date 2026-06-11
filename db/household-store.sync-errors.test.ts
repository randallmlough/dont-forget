import {
	isSyncInterruptedError,
	nativeSyncInterruptedError,
	SyncInterruptedError,
} from "./household-store";

describe("sync errors", () => {
	it("wraps known native network failures as typed sync interruptions", () => {
		const cause = new TypeError("Network request failed");
		const error = nativeSyncInterruptedError(cause);

		expect(error).toBeInstanceOf(SyncInterruptedError);
		expect(error).toMatchObject({
			reason: "networkUnavailable",
			cause,
		});
		expect(isSyncInterruptedError(error)).toBe(true);
	});

	it("wraps recoverable native sync engine failures", () => {
		const cause = new Error(
			"sync engine operation failed: unable to checkpoint synced portion of WAL",
		);

		expect(nativeSyncInterruptedError(cause)).toMatchObject({
			reason: "recoverableEngineFailure",
			cause,
		});
	});

	it("does not treat generic offline wording as a sync interruption", () => {
		expect(nativeSyncInterruptedError(new Error("offline"))).toBeNull();
	});
});
