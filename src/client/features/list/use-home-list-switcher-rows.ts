import type { useQuery as usePowerSyncQuery } from "@powersync/react";
import type { ListSummary } from "@/client/features/list/list-service";
import type { ProductQuery } from "@/client/lib/product-database";
import type { AuthenticatedAppSession } from "@/client/session";
import { useProductServices } from "./use-product-services";

export type HomeListSwitcherRows =
	| { status: "loading" }
	| { status: "error" }
	| { status: "ready"; summaries: ListSummary[] };

type PowerSyncWatchedQueryResult<T> = {
	data: T[];
	isLoading: boolean;
	isFetching: boolean;
	error: Error | undefined;
};

/**
 * Watches the active List summaries for the Home List switcher: exactly
 * `listLists({ archive: "active", sort: "recentActivity" })`, no searchText.
 * PowerSync re-runs the query whenever its tables change, so create/rename/
 * delete need no manual reload; query errors self-heal on the next change.
 */
export function useHomeListSwitcherRows(session: AuthenticatedAppSession): {
	rows: HomeListSwitcherRows;
} {
	const services = useProductServices({
		householdId: session.activeHousehold.id,
		userId: session.activeMember.userId,
	});
	// A fresh query object per render is fine: useQuery re-keys on the
	// compiled SQL + parameters, not object identity.
	const query = useQuery<ListSummary>(
		services.lists.listListsQuery({
			archive: "active",
			sort: "recentActivity",
		}),
	);

	if (query.error) {
		return { rows: { status: "error" } };
	}
	if (query.isLoading) {
		return { rows: { status: "loading" } };
	}
	return { rows: { status: "ready", summaries: query.data } };
}

function useQuery<RowType>(
	query: ProductQuery<RowType>,
): PowerSyncWatchedQueryResult<RowType> {
	// @powersync/react is ESM-only; loading it inside the hook keeps Jest tests
	// that do not render this hook from requiring the package at module import.
	const powersyncReact = require("@powersync/react") as {
		useQuery: typeof usePowerSyncQuery;
	};
	const usePowerSyncWatchedQuery: <T>(
		query: ProductQuery<T>,
	) => PowerSyncWatchedQueryResult<T> = powersyncReact.useQuery;
	return usePowerSyncWatchedQuery(query);
}
