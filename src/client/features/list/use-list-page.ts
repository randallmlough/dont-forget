import type { Item } from "@/client/features/list/item-service";
import type { ListSummary } from "@/client/features/list/list-service";
import type { AuthenticatedAppSession } from "@/client/session";
import {
	activeListStateFromItems,
	type ListPageActions,
	listPageActions,
} from "./list-page-data";
import type { ActiveListState } from "./list-view-types";
import { usePowerSyncQuery } from "./use-powersync-query";
import { useProductServices } from "./use-product-services";

export type ListPageState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| {
			status: "active";
			listId: string;
			list: ActiveListState;
			actions: ListPageActions;
	  };

const LIST_ERROR_MESSAGE = "Unable to load this List. Please try again.";

export function useListPage(
	session: AuthenticatedAppSession,
	summary: ListSummary,
): ListPageState {
	const services = useProductServices({
		householdId: session.activeHousehold.id,
		userId: session.activeMember.userId,
	});
	const items = usePowerSyncQuery<Item>(
		services.items.listItemsQuery({ listId: summary.id }),
	);

	if (items.error) {
		return { status: "error", message: LIST_ERROR_MESSAGE };
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
		actions: listPageActions({ session, services, listId: summary.id }),
	};
}
