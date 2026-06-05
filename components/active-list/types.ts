import type {
	SyncCoordinator,
	SyncOptions,
	SyncResult,
	SyncStatus,
} from "@/lib/services/sync";

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

export type ActiveListInitialState = ActiveListState;

export type ActiveListSyncState = SyncStatus;

export type ActiveListSyncResult = SyncResult;

export type ActiveListSyncOptions = SyncOptions;

export type ActiveListSyncCoordinator = Pick<
	SyncCoordinator,
	"getStatus" | "subscribe" | "requestSync"
>;

export type ActiveListActions = {
	addItem: (input: AddActiveListItemDraft) => Promise<void>;
	toggleItem: (itemId: string) => Promise<void>;
	refresh: () => Promise<void>;
};

export type ActiveListMeta = {
	currentMemberName: string;
	errorMessage: string | null;
	isRefreshing: boolean;
	syncState: ActiveListSyncState;
};
