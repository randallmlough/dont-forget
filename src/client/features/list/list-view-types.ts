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

export type ActiveListActions = {
	addItem: (input: AddActiveListItemDraft) => Promise<void>;
	toggleItem: (itemId: string) => Promise<void>;
};

export type ActiveListMeta = {
	currentMemberName: string;
	errorMessage: string | null;
	syncState: ActiveListSyncState;
};
