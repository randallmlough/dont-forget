import { useStatus } from "@powersync/react";
import { type ProductSyncStatus, syncStatusFrom } from "./sync-state";

export function useSyncState(): ProductSyncStatus {
	return syncStatusFrom(useStatus());
}
