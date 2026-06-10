import type { SyncResult } from "@/db/household-store";
import type { SyncStatusSubscription } from "./subscription";

// Re-exported because SyncResult is also coordinator vocabulary: app-facing
// code may only consume it through the service layer, never from @/db.
export type { SyncResult };

export type SyncStatus = "synced" | "pending" | "offline" | "failed";

export type SyncRequestReason =
	| "localWrite"
	| "manualRefresh"
	| "networkReconnect"
	| "appForeground"
	| "retry";

export type SyncMode = "full" | "pushLocalOnly";

export type SyncOptions = {
	mode?: SyncMode;
};

export type SyncOperation = (options?: SyncOptions) => Promise<SyncResult>;

export type SyncCoordinator = {
	getStatus: () => SyncStatus;
	subscribe: (listener: (status: SyncStatus) => void) => SyncStatusSubscription;
	start: () => void;
	stop: () => Promise<void>;
	requestSync: (request: {
		reason: SyncRequestReason;
	}) => Promise<SyncResult | null>;
};
