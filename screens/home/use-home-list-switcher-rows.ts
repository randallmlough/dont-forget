import { useCallback, useEffect, useRef, useState } from "react";
import type { ListSummary } from "@/lib/services/list";
import type { AuthenticatedAppSession } from "@/lib/services/session";

export type HomeListSwitcherRows =
	| { status: "loading" }
	| { status: "error" }
	| { status: "ready"; summaries: ListSummary[] };

/**
 * Loads the active List summaries for the Home List switcher: exactly
 * `listLists({ archive: "active", sort: "recentActivity" })`, no searchText.
 * `reload` re-runs the load (retry after a failed load); stale responses are
 * discarded via the attempt counter, including in-flight loads on unmount.
 */
export function useHomeListSwitcherRows(session: AuthenticatedAppSession): {
	rows: HomeListSwitcherRows;
	reload: () => Promise<void>;
} {
	const [rows, setRows] = useState<HomeListSwitcherRows>({ status: "loading" });
	const loadAttemptRef = useRef(0);

	const reload = useCallback(async () => {
		loadAttemptRef.current += 1;
		const attempt = loadAttemptRef.current;
		setRows({ status: "loading" });
		try {
			const summaries = await session.services.lists.listLists({
				archive: "active",
				sort: "recentActivity",
			});
			if (loadAttemptRef.current === attempt) {
				setRows({ status: "ready", summaries });
			}
		} catch {
			if (loadAttemptRef.current === attempt) {
				setRows({ status: "error" });
			}
		}
	}, [session]);

	useEffect(() => {
		void reload();
		return () => {
			// Invalidate any in-flight load on unmount.
			loadAttemptRef.current += 1;
		};
	}, [reload]);

	return { rows, reload };
}
