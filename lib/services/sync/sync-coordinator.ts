import { asError } from "@/lib/errors";
import type { Logger } from "@/lib/logger";

import type { SyncAppStateAdapter } from "./app-state";
import type {
	SyncNetworkStatus,
	SyncNetworkStatusAdapter,
} from "./network-status";
import type { SyncStatusSubscription } from "./subscription";
import {
	beginSyncAttempt,
	createSyncCoordinatorPolicyState,
	markLocalWrite,
	markStarted,
	markStopped,
	queueFollowUpReason,
	recordSuccessfulAttempt,
	type SyncAttempt,
	shouldRethrowSyncFailure,
	shouldSkipIdleRequest,
	syncOptionsForReason,
	takeQueuedFollowUpReason,
} from "./sync-coordinator-policy";
import { isSyncInterruptedError } from "./sync-errors";

export type SyncResult = {
	changed: boolean;
};

export type SyncStatus = "synced" | "pending" | "offline" | "failed";

export type SyncRequestReason =
	| "localWrite"
	| "manualRefresh"
	| "networkReconnect"
	| "appForeground"
	| "retry";

export type SyncMode = "full" | "pushLocalOnly";

export type SyncOptions = {
	mode?: SyncMode;
};

export type SyncOperation = (options?: SyncOptions) => Promise<SyncResult>;

export type SyncCoordinator = {
	getStatus: () => SyncStatus;
	subscribe: (listener: (status: SyncStatus) => void) => SyncStatusSubscription;
	start: () => void;
	stop: () => Promise<void>;
	requestSync: (request: {
		reason: SyncRequestReason;
	}) => Promise<SyncResult | null>;
};

export type SyncCoordinatorDeps = {
	syncAuthorized: boolean;
	sync: SyncOperation;
	appState: SyncAppStateAdapter;
	networkStatus: SyncNetworkStatusAdapter;
	logger: Logger;
	retryIntervalMs?: number;
};

const DEFAULT_RETRY_INTERVAL_MS = 30_000;

export function createSyncCoordinator({
	syncAuthorized,
	sync,
	appState,
	networkStatus,
	logger,
	retryIntervalMs = DEFAULT_RETRY_INTERVAL_MS,
}: SyncCoordinatorDeps): SyncCoordinator {
	const listeners = new Set<(status: SyncStatus) => void>();
	const state = createSyncCoordinatorPolicyState({
		syncAuthorized,
		currentNetworkStatus: networkStatus.getCurrentStatus(),
	});
	let inFlight: Promise<SyncResult | null> | null = null;
	let appStateSubscription: SyncStatusSubscription | null = null;
	let networkStatusSubscription: SyncStatusSubscription | null = null;
	let retryInterval: ReturnType<typeof setInterval> | null = null;

	function setStatus(nextStatus: SyncStatus) {
		if (state.stopped) return;
		if (state.status === nextStatus) return;
		state.status = nextStatus;
		for (const listener of listeners) {
			listener(state.status);
		}
	}

	async function shouldSkipForOffline(): Promise<{
		refreshedNetworkStatus: boolean;
		skip: boolean;
	}> {
		if (!syncAuthorized) {
			setStatus("offline");
			return { refreshedNetworkStatus: false, skip: true };
		}

		const previousNetworkStatus = networkStatus.getCurrentStatus();
		state.currentNetworkStatus = previousNetworkStatus;
		state.currentNetworkStatus = await networkStatus.refreshCurrentStatus();
		const refreshedNetworkStatus =
			state.currentNetworkStatus !== previousNetworkStatus;
		if (state.stopped) return { refreshedNetworkStatus, skip: true };

		if (state.currentNetworkStatus === "offline") {
			stopRetryTimer();
			setStatus("offline");
			return { refreshedNetworkStatus, skip: true };
		}

		return { refreshedNetworkStatus, skip: false };
	}

	async function requestSync({
		reason,
	}: {
		reason: SyncRequestReason;
	}): Promise<SyncResult | null> {
		if (state.stopped) return Promise.resolve(null);

		if (reason === "localWrite") {
			markLocalWrite(state);
			if (state.status === "offline") return null;
		}

		const inFlightBeforeNetworkRefresh = inFlight;
		const offlineDecision = await shouldSkipForOffline();
		if (offlineDecision.skip) return null;
		if (
			offlineDecision.refreshedNetworkStatus &&
			!inFlightBeforeNetworkRefresh &&
			inFlight &&
			reason !== "manualRefresh"
		) {
			return inFlight;
		}

		if (shouldSkipIdleRequest({ state, reason })) {
			return Promise.resolve(null);
		}

		if (inFlight) {
			queueFollowUpReason(state, reason);
			return inFlight;
		}

		return runSync(reason);
	}

	function runSync(reason: SyncRequestReason): Promise<SyncResult | null> {
		const attempt = beginSyncAttempt(state);
		setStatus("pending");

		inFlight = executeSync(reason, attempt).finally(() => {
			inFlight = null;
		});

		return inFlight;
	}

	async function executeSync(
		reason: SyncRequestReason,
		attempt: SyncAttempt,
	): Promise<SyncResult | null> {
		let result: SyncResult;

		try {
			result = await sync(syncOptionsForReason(reason));
		} catch (error) {
			if (
				attempt.lifecycleGeneration !== state.lifecycleGeneration ||
				state.stopped
			) {
				return null;
			}

			const syncError = handleSyncFailure(error, reason);
			const shouldRethrow = shouldRethrowSyncFailure(error, reason);

			let followUpResult: SyncResult | null;
			try {
				followUpResult = await runQueuedFollowUpAfterAttempt(syncError.result);
			} catch (followUpError) {
				if (shouldRethrow) {
					setStatus("failed");
					throw syncError.error;
				}
				throw followUpError;
			}

			if (shouldRethrow) {
				setStatus("failed");
				throw syncError.error;
			}

			return followUpResult;
		}
		if (
			attempt.lifecycleGeneration !== state.lifecycleGeneration ||
			state.stopped
		) {
			return null;
		}

		recordSuccessfulAttempt(state, attempt);

		state.currentNetworkStatus = networkStatus.getCurrentStatus();
		if (state.currentNetworkStatus === "offline") {
			if (!state.queuedFollowUpReason) {
				setStatus("offline");
				return result;
			}
			return runQueuedFollowUpAfterAttempt(result);
		}

		if (!state.queuedFollowUpReason) {
			setStatus("synced");
			return result;
		}

		return runQueuedFollowUpAfterAttempt(result);
	}

	async function runQueuedFollowUpAfterAttempt(
		previousResult: SyncResult | null,
	): Promise<SyncResult | null> {
		const followUpReason = takeQueuedFollowUpReason(state);
		if (!followUpReason) return previousResult;

		if (state.stopped) return previousResult;
		const offlineDecision = await shouldSkipForOffline();
		if (offlineDecision.skip) return previousResult;
		return runSync(followUpReason);
	}

	function handleSyncFailure(
		error: unknown,
		reason: SyncRequestReason,
	): {
		error: Error;
		result: SyncResult | null;
	} {
		const syncError = asError(error);
		if (isSyncInterruptedError(error)) {
			setStatus("offline");
			return { error: syncError, result: null };
		}

		logger.error("household sync failed", {
			error: syncError,
			reason,
		});
		setStatus("failed");
		return { error: syncError, result: null };
	}

	function requestForegroundSync() {
		if (state.stopped || !isActiveAppState(appState.getCurrentState())) return;
		void requestSync({ reason: "appForeground" });
	}

	function requestRetrySync() {
		if (state.stopped || !isActiveAppState(appState.getCurrentState())) return;
		void requestSync({ reason: "retry" });
	}

	function handleNetworkStatusChange(nextNetworkStatus: SyncNetworkStatus) {
		const previousNetworkStatus = state.currentNetworkStatus;
		state.currentNetworkStatus = nextNetworkStatus;

		if (nextNetworkStatus === "offline") {
			stopRetryTimer();
			setStatus("offline");
			return;
		}

		if (nextNetworkStatus === "online" && previousNetworkStatus !== "online") {
			startRetryTimer();
			if (!isActiveAppState(appState.getCurrentState())) return;
			void requestSync({ reason: "networkReconnect" });
		}
	}

	function startRetryTimer() {
		state.currentNetworkStatus = networkStatus.getCurrentStatus();
		if (
			retryInterval ||
			state.currentNetworkStatus === "offline" ||
			!isActiveAppState(appState.getCurrentState())
		) {
			return;
		}

		retryInterval = setInterval(() => {
			requestRetrySync();
		}, retryIntervalMs);
	}

	async function runStartupRetrySync() {
		const offlineDecision = await shouldSkipForOffline();
		if (offlineDecision.skip || inFlight || state.stopped) return;
		void runSync("retry");
	}

	function stopRetryTimer() {
		if (!retryInterval) return;
		clearInterval(retryInterval);
		retryInterval = null;
	}

	return {
		getStatus() {
			return state.status;
		},
		subscribe(listener) {
			listeners.add(listener);
			return {
				remove() {
					listeners.delete(listener);
				},
			};
		},
		start() {
			if (state.started) return;
			markStarted(state);

			if (!syncAuthorized) {
				setStatus("offline");
				return;
			}

			networkStatusSubscription = networkStatus.subscribe(
				handleNetworkStatusChange,
			);

			if (isActiveAppState(appState.getCurrentState())) {
				state.currentNetworkStatus = networkStatus.getCurrentStatus();
				if (state.currentNetworkStatus === "offline") {
					setStatus("offline");
				} else {
					startRetryTimer();
				}
				if (!inFlight && state.currentNetworkStatus === "offline") {
					void requestSync({ reason: "retry" });
				} else if (!inFlight) {
					void runStartupRetrySync();
				}
			}

			appStateSubscription = appState.subscribe((nextState) => {
				if (isActiveAppState(nextState)) {
					startRetryTimer();
					requestForegroundSync();
					return;
				}

				stopRetryTimer();
			});
		},
		async stop() {
			markStopped(state);
			appStateSubscription?.remove();
			appStateSubscription = null;
			networkStatusSubscription?.remove();
			networkStatusSubscription = null;
			stopRetryTimer();
			await inFlight?.catch(() => undefined);
		},
		requestSync,
	};
}

function isActiveAppState(state: string): boolean {
	return state !== "background" && state !== "inactive";
}
