import { useState } from "react";
import type { Item } from "@/client/features/list/item-service";
import type { ListSummary } from "@/client/features/list/list-service";
import type { ProductQuery } from "@/client/lib/product-database";
import { useProductQuery } from "@/client/lib/use-product-query";
import type { AuthenticatedAppSession } from "@/client/session";
import {
	activeListStateFromItems,
	type ListPageActions,
	listPageActions,
} from "./list-page-data";
import type { ActiveListState } from "./list-view-types";
import { useProductServices } from "./use-product-services";

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

export function useListPage(
	session: AuthenticatedAppSession,
	summary: ListSummary,
): ListPageState {
	const services = useProductServices({
		householdId: session.activeHousehold.id,
		userId: session.activeMember.userId,
	});
	const [retryEpoch, setRetryEpoch] = useState(0);
	const items = useProductQuery<Item>(
		retryKeyedQuery(
			services.items.listItemsQuery({ listId: summary.id }),
			retryEpoch,
		),
	);

	if (items.error) {
		return {
			status: "error",
			message: LIST_ERROR_MESSAGE,
			retry: () => setRetryEpoch((epoch) => epoch + 1),
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
		actions: listPageActions({ session, services, listId: summary.id }),
	};
}

/**
 * A watched PowerSync query re-runs when its compiled SQL or parameters change,
 * and the SDK offers no refresh of its own for one (`refresh` comes back only
 * from `runQueryOnce` queries). A page whose Items query failed therefore has
 * nothing left to re-trigger it — swiping away and back re-renders the same
 * query key. Retry re-keys it with a trailing SQL comment: SQLite ignores the
 * comment, `execute()` still runs the Item service's own read path, and the SDK
 * sees a query it has not run yet.
 */
function retryKeyedQuery<Row>(
	query: ProductQuery<Row>,
	retryEpoch: number,
): ProductQuery<Row> {
	if (retryEpoch === 0) return query;
	return {
		execute: () => query.execute(),
		compile: () => {
			const compiled = query.compile();
			return { ...compiled, sql: `${compiled.sql}\n-- retry ${retryEpoch}` };
		},
	};
}
