import { useSessionQuery } from "@/components/session";
import type { ListSummary } from "@/lib/services/list";
import type { AuthenticatedAppSession } from "@/lib/services/session";

export type HomeListSwitcherRows =
	| { status: "loading" }
	| { status: "error" }
	| { status: "ready"; summaries: ListSummary[] };

/**
 * Loads the active List summaries for the Home List switcher: exactly
 * `listLists({ archive: "active", sort: "recentActivity" })`, no searchText.
 * `reload` re-runs the load after create/rename/delete actions or failed loads;
 * Household DB change signals also refresh the rows.
 */
export function useHomeListSwitcherRows(session: AuthenticatedAppSession): {
	rows: HomeListSwitcherRows;
	reload: () => void;
} {
	const query = useSessionQuery({
		session,
		loadKey: session.resourceKey,
		load: () =>
			session.services.lists.listLists({
				archive: "active",
				sort: "recentActivity",
			}),
		errorMessage: "Unable to load Lists",
	});

	if (query.state.status === "ready") {
		return {
			rows: { status: "ready", summaries: query.state.data },
			reload: query.refetch,
		};
	}

	return {
		rows:
			query.state.status === "error"
				? { status: "error" }
				: { status: "loading" },
		reload: query.refetch,
	};
}
