import type { ProductSyncStatus } from "@/client/session/sync-state";

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

export type AddListItemDraft = AddActiveListItemDraft & {
	listId: string;
};

export type AddListItemInput = AddActiveListItemInput & {
	listId: string;
};

export type ActiveListState = {
	householdName: string;
	listName: string;
	items: ActiveListItem[];
};

export type ActiveListSyncState = ProductSyncStatus;

export type ActiveListMeta = {
	currentMemberName: string;
	errorMessage: string | null;
	syncState: ActiveListSyncState;
};
