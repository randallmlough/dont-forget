import type { SyncStatusSubscription } from "./subscription";

export type SyncResult = {
	changed: boolean;
};

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
