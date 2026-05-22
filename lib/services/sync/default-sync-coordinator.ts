import {
	getDefaultSyncAppStateAdapter,
	type SyncAppStateAdapter,
} from "./app-state";
import {
	getDefaultSyncNetworkStatusAdapter,
	type SyncNetworkStatusAdapter,
} from "./network-status";
import {
	createSyncCoordinator,
	type SyncCoordinator,
	type SyncCoordinatorDeps,
} from "./sync-coordinator";

type DefaultSyncCoordinatorDeps = Omit<
	SyncCoordinatorDeps,
	"appState" | "networkStatus"
> & {
	appState?: SyncAppStateAdapter;
	networkStatus?: SyncNetworkStatusAdapter;
};

const unauthorizedNetworkStatusAdapter: SyncNetworkStatusAdapter = {
	getCurrentStatus: () => "offline",
	refreshCurrentStatus: async () => "offline",
	subscribe: () => ({ remove() {} }),
};

export function createDefaultSyncCoordinator(
	deps: DefaultSyncCoordinatorDeps,
): SyncCoordinator {
	return createSyncCoordinator({
		...deps,
		appState: deps.appState ?? getDefaultSyncAppStateAdapter(),
		networkStatus:
			deps.networkStatus ??
			(deps.syncAuthorized
				? getDefaultSyncNetworkStatusAdapter()
				: unauthorizedNetworkStatusAdapter),
	});
}
