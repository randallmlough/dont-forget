import { asError, isExpectedSyncInterruptionError } from "@/lib/errors";
import type { Logger } from "@/lib/logger";

import type { SyncAppStateAdapter } from "./app-state";
import type {
	SyncNetworkStatus,
	SyncNetworkStatusAdapter,
} from "./network-status";
import type { SyncStatusSubscription } from "./subscription";

export type SyncResult = {
	changed: boolean;
	recoveredNativeSyncError?: Error;
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
	let status: SyncStatus =
		syncAuthorized && networkStatus.getCurrentStatus() !== "offline"
			? "synced"
			: "offline";
	let pendingLocalChangeVersion = 0;
	let inFlight: Promise<SyncResult | null> | null = null;
	let queuedFollowUpReason: SyncRequestReason | null = null;
	let lifecycleGeneration = 0;
	let started = false;
	let stopped = false;
	let appStateSubscription: SyncStatusSubscription | null = null;
	let networkStatusSubscription: SyncStatusSubscription | null = null;
	let currentNetworkStatus = networkStatus.getCurrentStatus();
	let retryInterval: ReturnType<typeof setInterval> | null = null;

	function setStatus(nextStatus: SyncStatus) {
		if (stopped) return;
		if (status === nextStatus) return;
		status = nextStatus;
		for (const listener of listeners) {
			listener(status);
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
		currentNetworkStatus = previousNetworkStatus;
		currentNetworkStatus = await networkStatus.refreshCurrentStatus();
		const refreshedNetworkStatus =
			currentNetworkStatus !== previousNetworkStatus;
		if (stopped) return { refreshedNetworkStatus, skip: true };

		if (currentNetworkStatus === "offline") {
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
		if (stopped) return Promise.resolve(null);

		if (reason === "localWrite") {
			pendingLocalChangeVersion += 1;
			if (status === "offline") return null;
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

		if (
			reason !== "manualRefresh" &&
			reason !== "localWrite" &&
			reason !== "networkReconnect" &&
			reason !== "appForeground" &&
			pendingLocalChangeVersion === 0 &&
			status === "synced"
		) {
			return Promise.resolve(null);
		}

		if (inFlight) {
			queuedFollowUpReason = coalesceQueuedReason(queuedFollowUpReason, reason);
			return inFlight;
		}

		return runSync(reason);
	}

	function runSync(reason: SyncRequestReason): Promise<SyncResult | null> {
		const syncStartedAtChangeVersion = pendingLocalChangeVersion;
		const syncLifecycleGeneration = lifecycleGeneration;
		setStatus("pending");

		inFlight = executeSync(
			reason,
			syncStartedAtChangeVersion,
			syncLifecycleGeneration,
		).finally(() => {
			inFlight = null;
		});

		return inFlight;
	}

	async function executeSync(
		reason: SyncRequestReason,
		syncStartedAtChangeVersion: number,
		syncLifecycleGeneration: number,
	): Promise<SyncResult | null> {
		let result: SyncResult;

		try {
			result = await sync(syncOptionsForReason(reason));
		} catch (error) {
			if (syncLifecycleGeneration !== lifecycleGeneration || stopped) {
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
		if (syncLifecycleGeneration !== lifecycleGeneration || stopped) {
			return null;
		}

		handleRecoveredNativeSyncFailure(result, reason);

		if (pendingLocalChangeVersion === syncStartedAtChangeVersion) {
			pendingLocalChangeVersion = 0;
		} else {
			queuedFollowUpReason = coalesceQueuedReason(
				queuedFollowUpReason,
				"retry",
			);
		}

		currentNetworkStatus = networkStatus.getCurrentStatus();
		if (currentNetworkStatus === "offline") {
			if (!queuedFollowUpReason) {
				setStatus("offline");
				return result;
			}
			return runQueuedFollowUpAfterAttempt(result);
		}

		if (!queuedFollowUpReason) {
			setStatus("synced");
			return result;
		}

		return runQueuedFollowUpAfterAttempt(result);
	}

	async function runQueuedFollowUpAfterAttempt(
		previousResult: SyncResult | null,
	): Promise<SyncResult | null> {
		const followUpReason = queuedFollowUpReason;
		if (!followUpReason) return previousResult;

		queuedFollowUpReason = null;
		if (stopped) return previousResult;
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
		const nativeSyncError = nativeSyncErrorFromFallbackFailure(error);
		if (nativeSyncError && !isExpectedSyncInterruptionError(nativeSyncError)) {
			logger.error("household native sync failed before fallback", {
				error: nativeSyncError,
				reason,
			});
		}
		if (isExpectedSyncInterruptionError(error)) {
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

	function handleRecoveredNativeSyncFailure(
		result: SyncResult,
		reason: SyncRequestReason,
	) {
		if (!result.recoveredNativeSyncError) return;
		if (isExpectedSyncInterruptionError(result.recoveredNativeSyncError)) {
			return;
		}

		logger.warn("household sync recovered", {
			error: result.recoveredNativeSyncError,
			reason,
		});
	}

	function requestForegroundSync() {
		if (stopped || !isActiveAppState(appState.getCurrentState())) return;
		void requestSync({ reason: "appForeground" });
	}

	function requestRetrySync() {
		if (stopped || !isActiveAppState(appState.getCurrentState())) return;
		void requestSync({ reason: "retry" });
	}

	function handleNetworkStatusChange(nextNetworkStatus: SyncNetworkStatus) {
		const previousNetworkStatus = currentNetworkStatus;
		currentNetworkStatus = nextNetworkStatus;

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
		currentNetworkStatus = networkStatus.getCurrentStatus();
		if (
			retryInterval ||
			currentNetworkStatus === "offline" ||
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
		if (offlineDecision.skip || inFlight || stopped) return;
		void runSync("retry");
	}

	function stopRetryTimer() {
		if (!retryInterval) return;
		clearInterval(retryInterval);
		retryInterval = null;
	}

	return {
		getStatus() {
			return status;
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
			if (started) return;
			started = true;
			stopped = false;

			if (!syncAuthorized) {
				setStatus("offline");
				return;
			}

			networkStatusSubscription = networkStatus.subscribe(
				handleNetworkStatusChange,
			);

			if (isActiveAppState(appState.getCurrentState())) {
				currentNetworkStatus = networkStatus.getCurrentStatus();
				if (currentNetworkStatus === "offline") {
					setStatus("offline");
				} else {
					startRetryTimer();
				}
				if (!inFlight && currentNetworkStatus === "offline") {
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
			started = false;
			stopped = true;
			lifecycleGeneration += 1;
			queuedFollowUpReason = null;
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

function shouldRethrowSyncFailure(
	error: unknown,
	reason: SyncRequestReason,
): boolean {
	return reason === "manualRefresh" && !isExpectedSyncInterruptionError(error);
}

function syncOptionsForReason(
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

function nativeSyncErrorFromFallbackFailure(error: unknown): Error | null {
	if (!error || typeof error !== "object") return null;
	const nativeSyncError = (error as { nativeSyncError?: unknown })
		.nativeSyncError;
	return nativeSyncError instanceof Error ? nativeSyncError : null;
}
