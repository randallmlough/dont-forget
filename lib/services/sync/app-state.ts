import { AppState } from "react-native";

import type { SyncStatusSubscription } from "./subscription";

export type SyncAppStateAdapter = {
	getCurrentState: () => string;
	subscribe: (listener: (state: string) => void) => SyncStatusSubscription;
};

let defaultSyncAppStateAdapter: SyncAppStateAdapter | null = null;

export function getDefaultSyncAppStateAdapter(): SyncAppStateAdapter {
	defaultSyncAppStateAdapter ??= {
		getCurrentState: () => AppState.currentState,
		subscribe(listener) {
			return AppState.addEventListener("change", (state) => {
				listener(state);
			});
		},
	};
	return defaultSyncAppStateAdapter;
}
