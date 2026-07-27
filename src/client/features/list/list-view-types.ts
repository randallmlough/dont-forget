import type { ActiveListItem } from "@/client/features/item/item-view-types";
import type { ProductSyncStatus } from "@/client/session/sync-state";

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
