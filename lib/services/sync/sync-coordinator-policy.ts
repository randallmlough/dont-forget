import { isSyncInterruptedError } from "@/db/household-store";
import type { SyncNetworkStatus } from "./network-status";
import type { SyncOptions, SyncRequestReason, SyncStatus } from "./sync-types";

export type SyncCoordinatorPolicyState = {
	status: SyncStatus;
	pendingLocalChangeVersion: number;
	queuedFollowUpReason: SyncRequestReason | null;
	lifecycleGeneration: number;
	started: boolean;
	stopped: boolean;
	currentNetworkStatus: SyncNetworkStatus;
};

export type SyncAttempt = {
	startedAtChangeVersion: number;
	lifecycleGeneration: number;
};

export function createSyncCoordinatorPolicyState({
	syncAuthorized,
	currentNetworkStatus,
}: {
	syncAuthorized: boolean;
	currentNetworkStatus: SyncNetworkStatus;
}): SyncCoordinatorPolicyState {
	return {
		status:
			syncAuthorized && currentNetworkStatus !== "offline"
				? "synced"
				: "offline",
		pendingLocalChangeVersion: 0,
		queuedFollowUpReason: null,
		lifecycleGeneration: 0,
		started: false,
		stopped: false,
		currentNetworkStatus,
	};
}

export function markLocalWrite(state: SyncCoordinatorPolicyState) {
	state.pendingLocalChangeVersion += 1;
}

export function shouldSkipIdleRequest({
	state,
	reason,
}: {
	state: SyncCoordinatorPolicyState;
	reason: SyncRequestReason;
}): boolean {
	return (
		reason !== "manualRefresh" &&
		reason !== "localWrite" &&
		reason !== "networkReconnect" &&
		reason !== "appForeground" &&
		state.pendingLocalChangeVersion === 0 &&
		state.status === "synced"
	);
}

export function queueFollowUpReason(
	state: SyncCoordinatorPolicyState,
	reason: SyncRequestReason,
) {
	state.queuedFollowUpReason = coalesceQueuedReason(
		state.queuedFollowUpReason,
		reason,
	);
}

export function beginSyncAttempt(
	state: SyncCoordinatorPolicyState,
): SyncAttempt {
	return {
		startedAtChangeVersion: state.pendingLocalChangeVersion,
		lifecycleGeneration: state.lifecycleGeneration,
	};
}

export function recordSuccessfulAttempt(
	state: SyncCoordinatorPolicyState,
	attempt: SyncAttempt,
) {
	if (state.pendingLocalChangeVersion === attempt.startedAtChangeVersion) {
		state.pendingLocalChangeVersion = 0;
		return;
	}

	queueFollowUpReason(state, "retry");
}

export function takeQueuedFollowUpReason(
	state: SyncCoordinatorPolicyState,
): SyncRequestReason | null {
	const followUpReason = state.queuedFollowUpReason;
	state.queuedFollowUpReason = null;
	return followUpReason;
}

export function markStarted(state: SyncCoordinatorPolicyState) {
	state.started = true;
	state.stopped = false;
}

export function markStopped(state: SyncCoordinatorPolicyState) {
	state.started = false;
	state.stopped = true;
	state.lifecycleGeneration += 1;
	state.queuedFollowUpReason = null;
}

export function shouldRethrowSyncFailure(
	error: unknown,
	reason: SyncRequestReason,
): boolean {
	return reason === "manualRefresh" && !isSyncInterruptedError(error);
}

export function syncOptionsForReason(
	reason: SyncRequestReason,
): SyncOptions | undefined {
	if (
		reason === "manualRefresh" ||
		reason === "appForeground" ||
		reason === "networkReconnect"
	) {
		return { mode: "full" };
	}
	return { mode: "pushLocalOnly" };
}

function coalesceQueuedReason(
	currentReason: SyncRequestReason | null,
	nextReason: SyncRequestReason,
): SyncRequestReason {
	if (currentReason === "manualRefresh" || nextReason === "manualRefresh") {
		return "manualRefresh";
	}

	if (
		currentReason === "networkReconnect" ||
		nextReason === "networkReconnect"
	) {
		return "networkReconnect";
	}

	if (currentReason === "localWrite" || nextReason === "localWrite") {
		return "localWrite";
	}

	if (currentReason === "appForeground" || nextReason === "appForeground") {
		return "appForeground";
	}

	return "retry";
}
