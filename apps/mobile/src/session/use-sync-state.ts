import { db } from "@mobile/session/powersync";
import { useSyncExternalStore } from "react";
import { type ProductSyncStatus, syncStatusFrom } from "./sync-state";

export function useSyncState(): ProductSyncStatus {
	return useSyncExternalStore(
		(onStoreChange: () => void) => {
			const dispose = db.registerListener({ statusChanged: onStoreChange });
			return dispose;
		},
		() => syncStatusFrom(db.currentStatus),
		() => syncStatusFrom(db.currentStatus),
	);
}
