import { asError, isExpectedSyncInterruptionError } from "@/lib/errors";
import type { Logger } from "@/lib/logger";
import type { HouseholdSyncResult } from "./household-store";

export type HouseholdSyncStatus = "synced" | "pending" | "offline" | "failed";

export type HouseholdSyncRequestReason =
	| "localWrite"
	| "manualRefresh"
	| "appForeground"
	| "retry";

export type HouseholdSyncMode = "full" | "pushLocalOnly";

export type HouseholdSyncOptions = {
	mode?: HouseholdSyncMode;
};

export type HouseholdSyncOperation = (
	options?: HouseholdSyncOptions,
) => Promise<HouseholdSyncResult>;

export type HouseholdSyncStatusSubscription = {
	remove: () => void;
};

export type HouseholdSyncAppStateAdapter = {
	getCurrentState: () => string;
	subscribe: (
		listener: (state: string) => void,
	) => HouseholdSyncStatusSubscription;
};

export type HouseholdSyncCoordinator = {
	getStatus: () => HouseholdSyncStatus;
	subscribe: (
		listener: (status: HouseholdSyncStatus) => void,
	) => HouseholdSyncStatusSubscription;
	start: () => void;
	stop: () => Promise<void>;
	requestSync: (request: {
		reason: HouseholdSyncRequestReason;
	}) => Promise<HouseholdSyncResult | null>;
};

export type HouseholdSyncCoordinatorDeps = {
	syncAuthorized: boolean;
	sync: HouseholdSyncOperation;
	appState: HouseholdSyncAppStateAdapter;
	logger: Logger;
	retryIntervalMs?: number;
};

const DEFAULT_RETRY_INTERVAL_MS = 30_000;

export function createHouseholdSyncCoordinator({
	syncAuthorized,
	sync,
	appState,
	logger,
	retryIntervalMs = DEFAULT_RETRY_INTERVAL_MS,
}: HouseholdSyncCoordinatorDeps): HouseholdSyncCoordinator {
	const listeners = new Set<(status: HouseholdSyncStatus) => void>();
	let status: HouseholdSyncStatus = syncAuthorized ? "synced" : "offline";
	let pendingLocalChangeVersion = 0;
	let inFlight: Promise<HouseholdSyncResult | null> | null = null;
	let queuedFollowUpReason: HouseholdSyncRequestReason | null = null;
	let lifecycleGeneration = 0;
	let started = false;
	let stopped = false;
	let appStateSubscription: HouseholdSyncStatusSubscription | null = null;
	let retryInterval: ReturnType<typeof setInterval> | null = null;

	function setStatus(nextStatus: HouseholdSyncStatus) {
		if (stopped) return;
		if (status === nextStatus) return;
		status = nextStatus;
		for (const listener of listeners) {
			listener(status);
		}
	}

	function shouldSkipForOffline() {
		if (!syncAuthorized) {
			setStatus("offline");
			return true;
		}

		return false;
	}

	function requestSync({
		reason,
	}: {
		reason: HouseholdSyncRequestReason;
	}): Promise<HouseholdSyncResult | null> {
		if (stopped) return Promise.resolve(null);

		if (reason === "localWrite") {
			pendingLocalChangeVersion += 1;
		}

		if (shouldSkipForOffline()) return Promise.resolve(null);

		if (
			reason !== "manualRefresh" &&
			reason !== "localWrite" &&
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

	function runSync(
		reason: HouseholdSyncRequestReason,
	): Promise<HouseholdSyncResult | null> {
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
		reason: HouseholdSyncRequestReason,
		syncStartedAtChangeVersion: number,
		syncLifecycleGeneration: number,
	): Promise<HouseholdSyncResult | null> {
		let result: HouseholdSyncResult;

		try {
			result = await sync(syncOptionsForReason(reason));
		} catch (error) {
			if (syncLifecycleGeneration !== lifecycleGeneration || stopped) {
				return null;
			}

			const syncError = handleSyncFailure(error, reason);
			const shouldRethrow = shouldRethrowSyncFailure(error, reason);

			let followUpResult: HouseholdSyncResult | null;
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

		if (!queuedFollowUpReason) {
			setStatus("synced");
			return result;
		}

		return runQueuedFollowUpAfterAttempt(result);
	}

	function runQueuedFollowUpAfterAttempt(
		previousResult: HouseholdSyncResult | null,
	): Promise<HouseholdSyncResult | null> | HouseholdSyncResult | null {
		const followUpReason = queuedFollowUpReason;
		if (!followUpReason) return previousResult;

		queuedFollowUpReason = null;
		if (stopped || shouldSkipForOffline()) return previousResult;
		return runSync(followUpReason);
	}

	function handleSyncFailure(
		error: unknown,
		reason: HouseholdSyncRequestReason,
	): {
		error: Error;
		result: HouseholdSyncResult | null;
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
		result: HouseholdSyncResult,
		reason: HouseholdSyncRequestReason,
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

	function startRetryTimer() {
		if (retryInterval || !isActiveAppState(appState.getCurrentState())) return;

		retryInterval = setInterval(() => {
			requestRetrySync();
		}, retryIntervalMs);
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

			if (isActiveAppState(appState.getCurrentState())) {
				startRetryTimer();
				if (!inFlight) {
					void runSync("retry");
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
	reason: HouseholdSyncRequestReason,
): boolean {
	return reason === "manualRefresh" && !isExpectedSyncInterruptionError(error);
}

function syncOptionsForReason(
	reason: HouseholdSyncRequestReason,
): HouseholdSyncOptions | undefined {
	if (reason === "manualRefresh" || reason === "appForeground") {
		return { mode: "full" };
	}
	return { mode: "pushLocalOnly" };
}

function coalesceQueuedReason(
	currentReason: HouseholdSyncRequestReason | null,
	nextReason: HouseholdSyncRequestReason,
): HouseholdSyncRequestReason {
	if (currentReason === "manualRefresh" || nextReason === "manualRefresh") {
		return "manualRefresh";
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
