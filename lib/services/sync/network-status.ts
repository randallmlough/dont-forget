import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

import { logger } from "@/lib/logger";

import type { SyncStatusSubscription } from "./subscription";

export type SyncNetworkStatus = "online" | "offline" | "unknown";

export type SyncNetworkStatusAdapter = {
	getCurrentStatus: () => SyncNetworkStatus;
	refreshCurrentStatus: () => Promise<SyncNetworkStatus>;
	subscribe: (
		listener: (status: SyncNetworkStatus) => void,
	) => SyncStatusSubscription;
};

let defaultSyncNetworkStatusAdapter: SyncNetworkStatusAdapter | null = null;

export function getDefaultSyncNetworkStatusAdapter(): SyncNetworkStatusAdapter {
	defaultSyncNetworkStatusAdapter ??= createNetInfoSyncNetworkStatusAdapter();
	return defaultSyncNetworkStatusAdapter;
}

function createNetInfoSyncNetworkStatusAdapter(): SyncNetworkStatusAdapter {
	const listeners = new Set<(status: SyncNetworkStatus) => void>();
	let currentStatus: SyncNetworkStatus = "unknown";

	function applyNetworkStatus(
		netInfoState: Pick<NetInfoState, "isConnected" | "isInternetReachable">,
	) {
		const nextStatus = syncNetworkStatusFromNetInfo(netInfoState);
		if (nextStatus === currentStatus) return;

		logger.info("sync network status changed", {
			previousStatus: currentStatus,
			nextStatus,
			isConnected: netInfoState.isConnected,
			isInternetReachable: netInfoState.isInternetReachable,
		});
		currentStatus = nextStatus;
		for (const listener of listeners) {
			listener(currentStatus);
		}
	}

	NetInfo.addEventListener((state) => {
		applyNetworkStatus(state);
	});

	return {
		getCurrentStatus() {
			return currentStatus;
		},
		async refreshCurrentStatus() {
			const state = await NetInfo.refresh();
			applyNetworkStatus(state);
			return currentStatus;
		},
		subscribe(listener) {
			listeners.add(listener);
			return {
				remove() {
					listeners.delete(listener);
				},
			};
		},
	};
}

// isConnected alone decides: NetInfo's isInternetReachable probe lags or lies
// after reconnect (post-2026-06 stranding incident), and the sync attempt
// itself is the authoritative reachability check.
function syncNetworkStatusFromNetInfo(
	state: Pick<NetInfoState, "isConnected">,
): SyncNetworkStatus {
	if (state.isConnected === false) {
		return "offline";
	}

	if (state.isConnected === true) {
		return "online";
	}

	return "unknown";
}
