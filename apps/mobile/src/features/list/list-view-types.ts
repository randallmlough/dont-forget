import type { ActiveListItem } from "@mobile/features/item/item-view-types";
import type { ProductSyncStatus } from "@mobile/session/sync-state";

export type ActiveListState = {
	householdName: string;
	listName: string;
	items: ActiveListItem[];
};

export type ActiveListSyncState = ProductSyncStatus;

export type ActiveListMeta = {
	currentMemberName: string;
	syncState: ActiveListSyncState;
};
