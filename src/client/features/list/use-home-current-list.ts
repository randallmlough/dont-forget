import { useEffect, useRef, useState } from "react";
import {
	clearCurrentListSelectionIfMatches,
	getCurrentListSelection,
} from "@/client/features/list/current-selection";
import type { Item } from "@/client/features/list/item-service";
import type { ListSummary } from "@/client/features/list/list-service";
import { useLogger } from "@/client/lib/logger";
import type { AuthenticatedAppSession } from "@/client/session";
import { asError } from "@/shared/errors";
import {
	activeListStateFromItems,
	type ListPageActions,
	listPageActions,
} from "./list-page-data";
import type { ActiveListState } from "./list-view-types";
import { usePowerSyncQuery } from "./use-powersync-query";
import {
	type ProductServices,
	useProductServices,
} from "./use-product-services";

export type HomeCurrentListActions = ListPageActions;

export type HomeCurrentListState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "zeroActive" }
	| {
			status: "active";
			listId: string;
			list: ActiveListState;
			actions: HomeCurrentListActions;
	  };

export type HomeCurrentListData = {
	state: HomeCurrentListState;
	retry: () => void;
	reload: () => void;
};

const LIST_ERROR_MESSAGE = "Unable to load this List. Please try again.";

/**
 * Resolves the Current List for Home from live watched SQL snapshots plus the
 * AsyncStorage-backed explicit selection:
 *
 * 1. Read the stored Current List selection for the active User + Household.
 * 2. Validate it against the live active List summaries snapshot.
 * 3. If the stored selection is inactive, clear it and fall back IN MEMORY to
 *    the most recently active List. Fallback is never persisted.
 * 4. Items are read through a watched query for the derived Current List id.
 *
 * SQL errors map to the retryable List error state. Selection-storage failures
 * log and degrade to the in-memory fallback.
 */
export function useHomeCurrentList(
	session: AuthenticatedAppSession,
): HomeCurrentListData {
	const userId = session.activeMember.userId;
	const householdId = session.activeHousehold.id;
	const logger = useLogger();
	const services = useProductServices({ householdId, userId });
	const { selection, refreshSelection } = useStoredCurrentListSelection(
		userId,
		householdId,
	);
	const selectionClearGuard = useRef<{
		selectionKey: string | null;
		summariesData: readonly ListSummary[] | null;
		observedSummariesAfterSelection: boolean;
	}>({
		selectionKey: null,
		summariesData: null,
		observedSummariesAfterSelection: false,
	});
	// Fresh query objects per render are fine: useQuery re-keys on compiled
	// SQL + parameters, not object identity.
	const summaries = usePowerSyncQuery<ListSummary>(
		services.lists.listListsQuery({
			archive: "active",
			sort: "recentActivity",
		}),
	);
	const storedListId =
		selection.status === "ready" ? selection.storedListId : null;
	const summariesReady = !summaries.isLoading && !summaries.error;
	const currentListId =
		selection.status === "ready" && summariesReady
			? deriveCurrentListId(storedListId, summaries.data)
			: null;
	// Hooks cannot be conditional; an empty-string List id matches no rows
	// while resolution is pending.
	const items = usePowerSyncQuery<Item>(
		services.items.listItemsQuery({ listId: currentListId ?? "" }),
	);
	const readySelectionKey = selection.status === "ready" ? selection.key : null;
	const readySelectionInitialRead =
		selection.status === "ready" && selection.initialRead;
	const summariesSettled =
		!summaries.isLoading &&
		!summaries.isFetching &&
		summaries.error === undefined;

	useEffect(() => {
		const guard = selectionClearGuard.current;
		if (guard.selectionKey !== readySelectionKey) {
			guard.selectionKey = readySelectionKey;
			guard.summariesData = summaries.data;
			guard.observedSummariesAfterSelection =
				readySelectionKey !== null &&
				readySelectionInitialRead &&
				summariesSettled;
			return;
		}
		if (guard.summariesData !== summaries.data) {
			guard.summariesData = summaries.data;
			guard.observedSummariesAfterSelection = readySelectionKey !== null;
		}
	}, [
		readySelectionKey,
		readySelectionInitialRead,
		summaries.data,
		summariesSettled,
	]);

	// A stored selection that is no longer an active List is stale: clear it
	// so it cannot shadow a later explicit selection. The in-memory fallback
	// is never persisted. The clear usually waits for a List summaries emission
	// after the current selection read so a just-persisted selection is not
	// cleared against a stale trailing-throttled watched-query snapshot. The
	// initial mount read has no just-persisted selection to protect, so it may
	// clear against an already-settled, non-fetching summaries snapshot.
	// `clearCurrentListSelectionIfMatches` is idempotent, so re-runs on later
	// summary emissions are no-ops. Failures log and degrade: the fallback List
	// still renders (Decision 5).
	useEffect(() => {
		const canClearAgainstSummaries =
			selectionClearGuard.current.selectionKey === readySelectionKey &&
			selectionClearGuard.current.observedSummariesAfterSelection;
		if (!summariesReady || storedListId === null) return;
		if (summaries.isFetching || !canClearAgainstSummaries) return;
		if (summaries.data.some((summary) => summary.id === storedListId)) return;
		void clearCurrentListSelectionIfMatches(
			userId,
			householdId,
			storedListId,
		).catch((error: unknown) => {
			logger.error("current List selection clear failed", {
				error: asError(error),
			});
		});
	}, [
		summariesReady,
		summaries.isFetching,
		summaries.data,
		readySelectionKey,
		storedListId,
		userId,
		householdId,
		logger,
	]);

	return {
		state: homeCurrentListState({
			session,
			services,
			selection,
			summaries,
			items,
			currentListId,
		}),
		retry: refreshSelection,
		// Current List selection lives in AsyncStorage (not watched by
		// PowerSync), so switch/create/delete flows re-read it explicitly
		// after persisting a new selection; the watched queries re-emit on
		// their own.
		reload: refreshSelection,
	};
}

type StoredSelectionState =
	| { status: "loading" }
	| {
			status: "ready";
			key: string;
			initialRead: boolean;
			storedListId: string | null;
	  };

type StoredSelectionSnapshot =
	| { status: "loading"; key: string }
	| { status: "ready"; key: string; storedListId: string | null };

function useStoredCurrentListSelection(
	userId: string,
	householdId: string,
): { selection: StoredSelectionState; refreshSelection: () => void } {
	const logger = useLogger();
	// `epoch` is a trigger token: `refreshSelection` bumps it to re-read the
	// AsyncStorage-backed selection after a switch/create/delete persisted a
	// new one. `selectionKey` makes loading derivable while the next read is in
	// flight. The cleanup flag guards against publishing after unmount or a
	// Household change.
	const [epoch, setEpoch] = useState(0);
	const selectionKey = `${userId}:${householdId}:${epoch}`;
	const [selectionSnapshot, setSelectionSnapshot] =
		useState<StoredSelectionSnapshot>({
			status: "loading",
			key: selectionKey,
		});
	const selection: StoredSelectionState =
		selectionSnapshot.key === selectionKey &&
		selectionSnapshot.status === "ready"
			? {
					status: "ready",
					key: selectionSnapshot.key,
					initialRead: epoch === 0,
					storedListId: selectionSnapshot.storedListId,
				}
			: {
					status: "loading",
				};

	useEffect(() => {
		let cancelled = false;
		getCurrentListSelection(userId, householdId)
			.catch((error: unknown) => {
				// A failed read behaves like no stored selection: the most
				// recently active List still renders (Decision 5).
				logger.error("current List selection read failed", {
					error: asError(error),
				});
				return null;
			})
			.then((storedListId) => {
				if (cancelled) return;
				setSelectionSnapshot({
					status: "ready",
					key: selectionKey,
					storedListId,
				});
			});
		return () => {
			cancelled = true;
		};
	}, [userId, householdId, selectionKey, logger]);

	return {
		selection,
		refreshSelection: () => setEpoch((value) => value + 1),
	};
}

function deriveCurrentListId(
	storedListId: string | null,
	activeSummaries: readonly ListSummary[],
): string | null {
	if (
		storedListId !== null &&
		activeSummaries.some((summary) => summary.id === storedListId)
	) {
		return storedListId;
	}
	// In-memory fallback to the most recently active List (the summaries
	// query's sort order); never persisted.
	return activeSummaries[0]?.id ?? null;
}

function homeCurrentListState(input: {
	session: AuthenticatedAppSession;
	services: ProductServices;
	selection: StoredSelectionState;
	summaries: {
		data: ListSummary[];
		isLoading: boolean;
		error: Error | undefined;
	};
	items: { data: Item[]; isLoading: boolean; error: Error | undefined };
	currentListId: string | null;
}): HomeCurrentListState {
	if (input.summaries.error || input.items.error) {
		return { status: "error", message: LIST_ERROR_MESSAGE };
	}
	if (input.selection.status === "loading" || input.summaries.isLoading) {
		return { status: "loading" };
	}
	if (input.currentListId === null) {
		return { status: "zeroActive" };
	}
	if (input.items.isLoading) {
		return { status: "loading" };
	}
	const summary = input.summaries.data.find(
		(candidate) => candidate.id === input.currentListId,
	);
	if (!summary) {
		// Type narrowing only: currentListId is derived from this same array.
		return { status: "loading" };
	}
	// Right after a switch the watched Items query may briefly still hold the
	// previous List's rows (the SDK keeps data while re-running on a
	// parameter change); rows are List-scoped, so filter (Decision 7).
	return {
		status: "active",
		listId: input.currentListId,
		list: activeListStateFromItems({
			session: input.session,
			listName: summary.name,
			listId: input.currentListId,
			items: input.items.data,
		}),
		actions: listPageActions({
			session: input.session,
			services: input.services,
			listId: input.currentListId,
		}),
	};
}
