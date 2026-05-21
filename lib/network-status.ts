import NetInfo, {
	type NetInfoSubscription,
} from "@react-native-community/netinfo";

export type NetworkConnectivity = "online" | "offline" | "unknown";

export type NetworkStatus = {
	connectivity: NetworkConnectivity;
};

export type NetworkStatusSubscription = {
	remove: () => void;
};

export type NetworkStatusAdapter = {
	getCurrentStatus: () => Promise<NetworkStatus>;
	subscribe: (
		listener: (status: NetworkStatus) => void,
	) => NetworkStatusSubscription;
};

type NetInfoConnectivitySnapshot = {
	isConnected: boolean | null;
	isInternetReachable: boolean | null;
};

type NetInfoDependency = {
	fetch: () => Promise<NetInfoConnectivitySnapshot>;
	addEventListener: (
		listener: (state: NetInfoConnectivitySnapshot) => void,
	) => NetInfoSubscription;
};

export function createNetInfoNetworkStatusAdapter(
	netInfo: NetInfoDependency = NetInfo,
): NetworkStatusAdapter {
	return {
		async getCurrentStatus() {
			return networkStatusFromNetInfoState(await netInfo.fetch());
		},
		subscribe(listener) {
			const unsubscribe = netInfo.addEventListener((state) => {
				listener(networkStatusFromNetInfoState(state));
			});
			return { remove: unsubscribe };
		},
	};
}

export function networkStatusFromNetInfoState(
	state: NetInfoConnectivitySnapshot,
): NetworkStatus {
	if (state.isConnected === false || state.isInternetReachable === false) {
		return { connectivity: "offline" };
	}

	if (state.isInternetReachable === true) {
		return { connectivity: "online" };
	}

	return { connectivity: "unknown" };
}

export const networkStatusAdapter = createNetInfoNetworkStatusAdapter();
