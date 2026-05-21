import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

import type { SyncStatusSubscription } from "./sync-coordinator";

export type SyncNetworkStatus = "online" | "offline" | "unknown";

export type SyncNetworkStatusAdapter = {
	getCurrentStatus: () => SyncNetworkStatus;
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

	NetInfo.addEventListener((state) => {
		const nextStatus = syncNetworkStatusFromNetInfo(state);
		if (nextStatus === currentStatus) return;

		currentStatus = nextStatus;
		for (const listener of listeners) {
			listener(currentStatus);
		}
	});

	return {
		getCurrentStatus() {
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

function syncNetworkStatusFromNetInfo(
	state: Pick<NetInfoState, "isConnected" | "isInternetReachable">,
): SyncNetworkStatus {
	if (state.isConnected === false || state.isInternetReachable === false) {
		return "offline";
	}

	if (state.isConnected === true) {
		return "online";
	}

	return "unknown";
}
