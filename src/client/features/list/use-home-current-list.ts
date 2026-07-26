import { useEffect, useRef, useState } from "react";
import {
	clearCurrentListSelectionIfMatches,
	getCurrentListSelection,
} from "@/client/features/list/current-selection";
import type { ListSummary } from "@/client/features/list/list-service";
import { useLogger } from "@/client/lib/logger";
import type { AuthenticatedAppSession } from "@/client/session";
import { asError } from "@/shared/errors";
import { usePowerSyncQuery } from "./use-powersync-query";
import { useProductServices } from "./use-product-services";

export type HomeCurrentListState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "zeroActive" }
	| { status: "active"; listId: string };

export type HomeCurrentListData = {
	state: HomeCurrentListState;
	retry: () => void;
	reload: () => void;
};

const LIST_ERROR_MESSAGE = "Unable to load this List. Please try again.";

/**
 * Resolves which List is the Current List for Home from the live active List
 * summaries snapshot plus the AsyncStorage-backed explicit selection:
 *
 * 1. Read the stored Current List selection for the active User + Household.
 * 2. Validate it against the live active List summaries snapshot.
 * 3. If the stored selection is inactive, clear it and fall back IN MEMORY to
 *    the most recently active List. Fallback is never persisted.
 *
 * The resolver owns the selected List id only. Item rows belong to whichever
 * List page renders them (`useListPage`), so one List's failed Items query
 * surfaces on that page instead of gating Home's List pager and picker.
 *
 * Summaries SQL errors map to the retryable List error state. Selection-storage
 * failures log and degrade to the in-memory fallback.
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
	// first read for a User + Household has no just-persisted selection to
	// protect, so it may clear against an already-settled, non-fetching
	// summaries snapshot. `clearCurrentListSelectionIfMatches` is idempotent, so
	// re-runs on later summary emissions are no-ops. Failures log and degrade:
	// the fallback List still renders (Decision 5).
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
		state: homeCurrentListState({ selection, summaries, currentListId }),
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

type StoredSelectionSnapshot = {
	identity: string;
	epoch: number;
	initialRead: boolean;
	storedListId: string | null;
};

function useStoredCurrentListSelection(
	userId: string,
	householdId: string,
): { selection: StoredSelectionState; refreshSelection: () => void } {
	const logger = useLogger();
	// `epoch` is a trigger token: `refreshSelection` bumps it to re-read the
	// AsyncStorage-backed selection after a switch/create/delete persisted a
	// new one. A refresh read keeps serving the snapshot it is revalidating, so
	// re-reading after a List switch never drops Home back to loading and
	// unmounts the List pager mid-switch. Only a User or Household change has
	// no snapshot left to serve and reports loading. The cleanup flag guards
	// against publishing after unmount or after that change.
	const identity = `${userId}:${householdId}`;
	const [epoch, setEpoch] = useState(0);
	const [snapshot, setSnapshot] = useState<StoredSelectionSnapshot | null>(
		null,
	);
	const selection: StoredSelectionState =
		snapshot !== null && snapshot.identity === identity
			? {
					status: "ready",
					key: `${snapshot.identity}:${snapshot.epoch}`,
					initialRead: snapshot.initialRead,
					storedListId: snapshot.storedListId,
				}
			: { status: "loading" };

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
				setSnapshot((previous) => ({
					identity,
					epoch,
					// Only the first read for a User + Household has no
					// just-persisted selection to protect from a stale summaries
					// snapshot; a refresh read always follows one.
					initialRead: previous?.identity !== identity,
					storedListId,
				}));
			});
		return () => {
			cancelled = true;
		};
	}, [userId, householdId, identity, epoch, logger]);

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
	selection: StoredSelectionState;
	summaries: { isLoading: boolean; error: Error | undefined };
	currentListId: string | null;
}): HomeCurrentListState {
	if (input.summaries.error) {
		return { status: "error", message: LIST_ERROR_MESSAGE };
	}
	if (input.selection.status === "loading" || input.summaries.isLoading) {
		return { status: "loading" };
	}
	if (input.currentListId === null) {
		return { status: "zeroActive" };
	}
	return { status: "active", listId: input.currentListId };
}
