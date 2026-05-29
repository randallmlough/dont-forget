import {
	beginSyncAttempt,
	createSyncCoordinatorPolicyState,
	markLocalWrite,
	queueFollowUpReason,
	recordSuccessfulAttempt,
	shouldSkipIdleRequest,
	syncOptionsForReason,
	takeQueuedFollowUpReason,
} from "./sync-coordinator-policy";

describe("sync coordinator policy", () => {
	it("keeps concurrent local writes pending behind the active sync attempt", () => {
		const state = createSyncCoordinatorPolicyState({
			syncAuthorized: true,
			currentNetworkStatus: "online",
		});

		markLocalWrite(state);
		const attempt = beginSyncAttempt(state);
		markLocalWrite(state);
		recordSuccessfulAttempt(state, attempt);

		expect(state.pendingLocalChangeVersion).toBe(2);
		expect(takeQueuedFollowUpReason(state)).toBe("retry");
	});

	it("clears local writes covered by a successful sync attempt", () => {
		const state = createSyncCoordinatorPolicyState({
			syncAuthorized: true,
			currentNetworkStatus: "online",
		});

		markLocalWrite(state);
		const attempt = beginSyncAttempt(state);
		recordSuccessfulAttempt(state, attempt);

		expect(state.pendingLocalChangeVersion).toBe(0);
		expect(takeQueuedFollowUpReason(state)).toBeNull();
	});

	it("prioritizes full follow-up sync reasons over local push reasons", () => {
		const state = createSyncCoordinatorPolicyState({
			syncAuthorized: true,
			currentNetworkStatus: "online",
		});

		queueFollowUpReason(state, "localWrite");
		queueFollowUpReason(state, "networkReconnect");
		queueFollowUpReason(state, "manualRefresh");

		expect(takeQueuedFollowUpReason(state)).toBe("manualRefresh");
	});

	it("skips idle retry work only when the coordinator is already synced", () => {
		const state = createSyncCoordinatorPolicyState({
			syncAuthorized: true,
			currentNetworkStatus: "online",
		});

		expect(shouldSkipIdleRequest({ state, reason: "retry" })).toBe(true);

		markLocalWrite(state);

		expect(shouldSkipIdleRequest({ state, reason: "retry" })).toBe(false);
		expect(shouldSkipIdleRequest({ state, reason: "manualRefresh" })).toBe(
			false,
		);
	});

	it("uses full sync options only for catch-up requests", () => {
		expect(syncOptionsForReason("manualRefresh")).toEqual({ mode: "full" });
		expect(syncOptionsForReason("networkReconnect")).toEqual({ mode: "full" });
		expect(syncOptionsForReason("appForeground")).toEqual({ mode: "full" });
		expect(syncOptionsForReason("localWrite")).toEqual({
			mode: "pushLocalOnly",
		});
		expect(syncOptionsForReason("retry")).toEqual({ mode: "pushLocalOnly" });
	});
});
