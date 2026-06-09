import { useCallback, useEffect, useState } from "react";

import { track } from "@/lib/analytics";
import { setCurrentListSelection } from "@/lib/local-storage";
import type { ListSummary } from "@/lib/services/list";
import type { AuthenticatedAppSession } from "@/lib/services/session";

export type HomeListSwitcherState =
	| { status: "loading" }
	| { status: "error" }
	| { status: "ready"; summaries: ListSummary[] };

export function useHomeListSwitcher({
	currentListId,
	isPresented,
	onIsPresentedChange,
	onListSelected,
	session,
}: {
	currentListId: string;
	isPresented: boolean;
	onIsPresentedChange: (isPresented: boolean) => void;
	onListSelected: (listId: string) => void;
	session: AuthenticatedAppSession;
}): {
	state: HomeListSwitcherState;
	switchingListId: string | null;
	retry: () => void;
	selectList: (listId: string) => Promise<void>;
} {
	const [state, setState] = useState<HomeListSwitcherState>({
		status: "loading",
	});
	const [switchingListId, setSwitchingListId] = useState<string | null>(null);

	const loadSummaries = useCallback(() => {
		let cancelled = false;
		setState({ status: "loading" });

		session.services.lists
			.listLists({ archive: "active", sort: "recentActivity" })
			.then((summaries) => {
				if (!cancelled) {
					setState({ status: "ready", summaries });
				}
			})
			.catch(() => {
				if (!cancelled) {
					setState({ status: "error" });
				}
			});

		return () => {
			cancelled = true;
		};
	}, [session.services.lists]);

	useEffect(() => {
		if (!isPresented) return;
		return loadSummaries();
	}, [isPresented, loadSummaries]);

	const selectList = useCallback(
		async (listId: string) => {
			if (listId === currentListId || switchingListId) return;

			setSwitchingListId(listId);
			try {
				await setCurrentListSelection(
					session.user.id,
					session.activeHousehold.id,
					listId,
				);
				track("list_switched", {
					household_id: session.activeHousehold.id,
					list_id: listId,
					user_id: session.user.id,
				});
				onListSelected(listId);
				onIsPresentedChange(false);
			} finally {
				setSwitchingListId(null);
			}
		},
		[
			currentListId,
			onIsPresentedChange,
			onListSelected,
			session.activeHousehold.id,
			session.user.id,
			switchingListId,
		],
	);

	return {
		state,
		switchingListId,
		retry: loadSummaries,
		selectList,
	};
}
