import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

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

	function applyNetworkStatus(nextStatus: SyncNetworkStatus) {
		if (nextStatus === currentStatus) return;

		currentStatus = nextStatus;
		for (const listener of listeners) {
			listener(currentStatus);
		}
	}

	NetInfo.addEventListener((state) => {
		applyNetworkStatus(syncNetworkStatusFromNetInfo(state));
	});

	return {
		getCurrentStatus() {
			return currentStatus;
		},
		async refreshCurrentStatus() {
			const state = await NetInfo.refresh();
			applyNetworkStatus(syncNetworkStatusFromNetInfo(state));
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
