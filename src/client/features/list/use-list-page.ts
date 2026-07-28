import type { Item, ItemService } from "@/client/features/item/item-service";
import type {
	AddListItemInput,
	DeleteListItemInput,
	UpdateListItemInput,
} from "@/client/features/item/item-view-types";
import { useItemService } from "@/client/features/item/use-item-service";
import type { ListSummary } from "@/client/features/list/list-service";
import { useProductQuery } from "@/client/lib/use-product-query";
import type { AuthenticatedAppSession } from "@/client/session";
import type { ActiveListState } from "./list-view-types";

export type ListPageActions = {
	addItem: (input: AddListItemInput) => Promise<void>;
	updateItem: (input: UpdateListItemInput) => Promise<void>;
	deleteItem: (input: DeleteListItemInput) => Promise<void>;
	setItemChecked: (itemId: string, checked: boolean) => Promise<void>;
};

export type ListPageState =
	| { status: "loading" }
	| { status: "error"; message: string; retry: () => void }
	| {
			status: "active";
			listId: string;
			list: ActiveListState;
			actions: ListPageActions;
	  };

const LIST_ERROR_MESSAGE = "Unable to load this List. Please try again.";

function activeListStateFromItems({
	session,
	listName,
	listId,
	items,
}: {
	session: AuthenticatedAppSession;
	listName: string;
	listId: string;
	items: readonly Item[];
}): ActiveListState {
	const memberNames = memberNamesFromSession(session);

	return {
		householdName: session.activeHousehold.name,
		listName,
		items: items
			.filter((item) => item.listId === listId)
			.map((item) => ({
				id: item.id,
				name: item.name,
				quantity: item.quantity,
				notes: item.notes,
				checked: item.checked,
				checkedByMemberName:
					item.checked && item.checkedByUserId
						? (memberNames.get(item.checkedByUserId) ?? null)
						: null,
			})),
	};
}

function listPageActions({
	session,
	itemService,
	listId,
}: {
	session: AuthenticatedAppSession;
	itemService: ItemService;
	listId: string;
}): ListPageActions {
	return {
		async addItem(input: AddListItemInput) {
			await itemService.addItem({
				listId: input.listId,
				userId: session.activeMember.userId,
				name: input.name,
				quantity: input.quantity,
				notes: input.notes,
			});
		},
		async updateItem(input: UpdateListItemInput) {
			await itemService.updateItem({
				...input,
				userId: session.activeMember.userId,
			});
		},
		async deleteItem(input: DeleteListItemInput) {
			await itemService.deleteItem({
				...input,
				userId: session.activeMember.userId,
			});
		},
		async setItemChecked(itemId: string, checked: boolean) {
			await itemService.setItemChecked({
				listId,
				itemId,
				userId: session.activeMember.userId,
				checked,
			});
		},
	};
}

function memberNamesFromSession(
	session: AuthenticatedAppSession,
): Map<string, string | null> {
	const names = new Map<string, string | null>();
	for (const member of session.members) {
		names.set(member.userId, member.displayName);
	}
	names.set(
		session.activeMember.userId,
		session.activeMember.displayName ??
			session.user.displayName ??
			session.user.email ??
			"Member",
	);
	return names;
}

export function useListPage(
	session: AuthenticatedAppSession,
	summary: ListSummary,
): ListPageState {
	const itemService = useItemService({
		householdId: session.activeHousehold.id,
	});
	const items = useProductQuery<Item>(
		itemService.listItemsQuery({ listId: summary.id }),
	);

	if (items.error) {
		return {
			status: "error",
			message: LIST_ERROR_MESSAGE,
			retry: items.retry,
		};
	}
	if (items.isLoading) {
		return { status: "loading" };
	}

	return {
		status: "active",
		listId: summary.id,
		list: activeListStateFromItems({
			session,
			listName: summary.name,
			listId: summary.id,
			items: items.data,
		}),
		actions: listPageActions({ session, itemService, listId: summary.id }),
	};
}
