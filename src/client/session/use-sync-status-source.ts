import { useMemo } from "react";
import { db } from "@/client/session/powersync";
import { type ProductSyncStatus, syncStatusFrom } from "./sync-state";

export function useSyncStatusSource(): {
	getStatus: () => ProductSyncStatus;
	subscribe: (listener: () => void) => { remove: () => void };
} {
	return useMemo(
		() => ({
			getStatus: () => syncStatusFrom(db.currentStatus),
			subscribe(listener) {
				const dispose = db.registerListener({ statusChanged: listener });
				return { remove: dispose };
			},
		}),
		[],
	);
}
