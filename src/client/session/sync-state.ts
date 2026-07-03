import type { SyncStatus } from "@powersync/react-native";

export type ProductSyncStatus = "synced" | "pending" | "offline" | "failed";

export function syncStatusFrom(status: SyncStatus): ProductSyncStatus {
	const flow = status.dataFlowStatus;
	if (flow.downloadError || flow.uploadError) return "failed";
	if (status.connecting || flow.downloading || flow.uploading) return "pending";
	if (status.connected) return status.hasSynced ? "synced" : "pending";
	return "offline";
}
