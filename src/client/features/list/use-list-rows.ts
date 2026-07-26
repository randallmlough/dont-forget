import type { ListSummary } from "@/client/features/list/list-service";
import { useProductQuery } from "@/client/lib/use-product-query";
import type { AuthenticatedAppSession } from "@/client/session";
import { useProductServices } from "./use-product-services";

export type ListRows =
	| { status: "loading" }
	| { status: "error" }
	| {
			status: "ready";
			summaries: ListSummary[];
			/** Whether a re-read is in flight behind the summaries on screen. */
			isFetching: boolean;
	  };

/**
 * Watches the active List summaries for List-management surfaces: exactly
 * `listLists({ archive: "active", sort: "recentActivity" })`, no searchText.
 * PowerSync re-runs the query whenever its tables change, so create/rename/
 * delete need no manual reload; query errors self-heal on the next change.
 */
export function useListRows(session: AuthenticatedAppSession): {
	rows: ListRows;
} {
	const services = useProductServices({
		householdId: session.activeHousehold.id,
		userId: session.activeMember.userId,
	});
	// A fresh query object per render is fine: useQuery re-keys on the
	// compiled SQL + parameters, not object identity.
	const query = useProductQuery<ListSummary>(
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
	return {
		rows: {
			status: "ready",
			summaries: query.data,
			isFetching: query.isFetching,
		},
	};
}
