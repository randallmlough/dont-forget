export type ActiveListItem = {
	id: string;
	name: string;
	quantity: string | null;
	notes: string | null;
	checked: boolean;
	checkedByMemberName?: string | null;
};

export type AddActiveListItemDraft = {
	name: string;
	quantity: string;
	notes: string;
};

export type AddActiveListItemInput = {
	name: string;
	quantity: string | null;
	notes: string | null;
};

export type ActiveListState = {
	householdName: string;
	listName: string;
	items: ActiveListItem[];
};

export type ActiveListSyncState = "synced" | "pending" | "offline" | "failed";

// The read-only PowerSync sync-status seam the Active List subscribes to.
// PowerSync uploads continuously, so there is no manual sync request — only the
// current status and a change subscription (replaces the deleted sync coordinator).
export type ActiveListSyncStatusSource = {
	getStatus: () => ActiveListSyncState;
	subscribe: (listener: () => void) => { remove: () => void };
};

export type ActiveListActions = {
	addItem: (input: AddActiveListItemDraft) => Promise<void>;
	toggleItem: (itemId: string) => Promise<void>;
};

export type ActiveListMeta = {
	currentMemberName: string;
	errorMessage: string | null;
	syncState: ActiveListSyncState;
};
