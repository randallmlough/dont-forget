export type ActiveListItem = {
	id: string;
	name: string;
	quantity: string | null;
	notes: string | null;
	checked: boolean;
	checkedByMemberName?: string | null;
};

export type ItemDraftValues = {
	name: string;
	quantity: string;
	notes: string;
	selectedListId: string;
};

export type AddListItemInput = {
	listId: string;
	name: string;
	quantity: string | null;
	notes: string | null;
};

export type UpdateListItemInput = {
	itemId: string;
	sourceListId: string;
	destinationListId: string;
	name: string;
	quantity: string | null;
	notes: string | null;
};

export type DeleteListItemInput = {
	itemId: string;
	listId: string;
};

export type ItemListOption = {
	id: string;
	name: string;
};
