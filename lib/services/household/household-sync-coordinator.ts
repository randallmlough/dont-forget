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
	stop: () => void;
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
	let started = false;
	let stopped = false;
	let appStateSubscription: HouseholdSyncStatusSubscription | null = null;
	let retryInterval: ReturnType<typeof setInterval> | null = null;

	function setStatus(nextStatus: HouseholdSyncStatus) {
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
		if (reason === "localWrite") {
			pendingLocalChangeVersion += 1;
		}

		if (shouldSkipForOffline()) return Promise.resolve(null);

		if (
			reason !== "manualRefresh" &&
			reason !== "localWrite" &&
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
		setStatus("pending");

		inFlight = executeSync(reason, syncStartedAtChangeVersion).finally(() => {
			inFlight = null;
		});

		return inFlight;
	}

	async function executeSync(
		reason: HouseholdSyncRequestReason,
		syncStartedAtChangeVersion: number,
	): Promise<HouseholdSyncResult | null> {
		let result: HouseholdSyncResult;

		try {
			result = await sync(syncOptionsForReason(reason));
		} catch (error) {
			return handleSyncFailure(error, reason);
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

		const followUpReason = queuedFollowUpReason;
		queuedFollowUpReason = null;
		if (stopped || shouldSkipForOffline()) return result;
		return runSync(followUpReason);
	}

	function handleSyncFailure(
		error: unknown,
		reason: HouseholdSyncRequestReason,
	): HouseholdSyncResult | null {
		if (isExpectedSyncInterruptionError(error)) {
			setStatus("offline");
			return null;
		}

		const syncError = asError(error);
		logger.error("household sync failed", {
			error: syncError,
			reason,
		});
		setStatus("failed");
		if (reason === "manualRefresh") {
			throw syncError;
		}
		return null;
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
		if (
			stopped ||
			appState.getCurrentState() === "background" ||
			appState.getCurrentState() === "inactive" ||
			(pendingLocalChangeVersion === 0 && status === "synced")
		) {
			return;
		}

		void requestSync({ reason: "appForeground" });
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

			if (!inFlight) {
				void runSync("retry");
			}

			appStateSubscription = appState.subscribe((nextState) => {
				if (nextState === "active") requestForegroundSync();
			});

			retryInterval = setInterval(() => {
				requestForegroundSync();
			}, retryIntervalMs);
		},
		stop() {
			started = false;
			stopped = true;
			appStateSubscription?.remove();
			appStateSubscription = null;
			if (retryInterval) {
				clearInterval(retryInterval);
				retryInterval = null;
			}
		},
		requestSync,
	};
}

function syncOptionsForReason(
	reason: HouseholdSyncRequestReason,
): HouseholdSyncOptions | undefined {
	if (reason === "manualRefresh") return { mode: "full" };
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
