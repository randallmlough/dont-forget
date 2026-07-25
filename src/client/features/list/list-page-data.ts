import type { Item } from "@/client/features/list/item-service";
import type { AuthenticatedAppSession } from "@/client/session";
import type { ActiveListState, AddListItemInput } from "./list-view-types";
import type { ProductServices } from "./use-product-services";

export type ListPageActions = {
	addItem: (input: AddListItemInput) => Promise<void>;
	setItemChecked: (itemId: string, checked: boolean) => Promise<void>;
};

export function activeListStateFromItems({
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

export function listPageActions({
	session,
	services,
	listId,
}: {
	session: AuthenticatedAppSession;
	services: ProductServices;
	listId: string;
}): ListPageActions {
	return {
		async addItem(input: AddListItemInput) {
			await services.items.addItem({
				listId: input.listId,
				userId: session.activeMember.userId,
				name: input.name,
				quantity: input.quantity,
				notes: input.notes,
			});
		},
		async setItemChecked(itemId: string, checked: boolean) {
			await services.items.setItemChecked({
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
