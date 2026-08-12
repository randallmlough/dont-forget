import { asError } from "@dont-forget/shared";
import type { CurrentListSelectionStore } from "@mobile/features/list/current-selection";
import type {
	CreateListResult,
	DeleteListResult,
	ListNameValidationError,
	ListSummary,
	RenameListResult,
} from "@mobile/features/list/list-service";
import { track } from "@mobile/lib/analytics";
import { useLogger } from "@mobile/lib/logger";
import { useProductQuery } from "@mobile/lib/use-product-query";
import type { AuthenticatedAppSession } from "@mobile/session";
import { useCallback, useEffect, useRef, useState } from "react";
import { useListServices } from "./use-list-services";

const LIST_ERROR_MESSAGE = "Unable to load your Lists. Please try again.";

export type ListCollectionState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| {
			status: "resolvingCurrentList";
			summaries: readonly ListSummary[];
	  }
	| { status: "zeroActive" }
	| {
			status: "active";
			summaries: readonly ListSummary[];
			currentListId: string;
	  };

export type SelectListOutcome =
	| { status: "selected" }
	| { status: "alreadyCurrent" }
	| {
			status: "notSelected";
			reason: "busy" | "selectionFailed";
			currentListId: string | null;
	  };

export type CreateListOutcome =
	| { status: "createdAndSelected"; listId: string }
	| { status: "createdSelectionFailed"; listId: string }
	| { status: "invalidName"; reason: ListNameValidationError }
	| { status: "failed" };

export type RenameListOutcome =
	| { status: "renamed" }
	| { status: "unchanged" }
	| { status: "invalidName"; reason: ListNameValidationError }
	| { status: "gone" }
	| { status: "failed" };

export type DeleteListOutcome =
	| { status: "deleted" }
	| { status: "gone" }
	| { status: "failed" };

export type ListCollection = {
	state: ListCollectionState;
	actions: {
		retry: () => void;
		selectList: (input: { listId: string }) => Promise<SelectListOutcome>;
		createList: (input: { name: string }) => Promise<CreateListOutcome>;
		renameList: (input: {
			listId: string;
			name: string;
		}) => Promise<RenameListOutcome>;
		deleteList: (input: { listId: string }) => Promise<DeleteListOutcome>;
	};
};

type StoredSelectionState =
	| { status: "loading" }
	| {
			status: "ready";
			key: string;
			initialRead: boolean;
			refreshing: boolean;
			storedListId: string | null;
	  };

type StoredSelectionSnapshot = {
	identity: string;
	epoch: number;
	initialRead: boolean;
	storedListId: string | null;
};

/**
 * Each mounted screen owns its own collection instance, with its own watched
 * summaries query and its own in-flight selection guard. That guard serializes
 * Current List writes within one instance only, which is enough because Home
 * and Lists never mount concurrently.
 */
export function useListCollection(
	session: AuthenticatedAppSession,
): ListCollection {
	const userId = session.activeMember.userId;
	const householdId = session.activeHousehold.id;
	const logger = useLogger();
	const services = useListServices({ householdId, userId });
	const selectionStore = services.currentListSelection;
	const { selection, refreshSelection } = useStoredCurrentListSelection(
		selectionStore,
		userId,
		householdId,
	);
	const query = useProductQuery<ListSummary>(
		services.lists.listListsQuery({
			archive: "active",
			sort: "recentActivity",
		}),
	);
	const selectionClearGuard = useRef<SelectionClearGuard>({
		selectionKey: null,
		summariesData: null,
		observedSummariesAfterSelection: false,
	});
	const latestCurrentListIdRef = useRef<string | null>(null);
	const selectionWriteInFlightRef = useRef(false);
	// The watched summaries snapshot while it is on screen, and null while it is
	// loading or failed. Its identity is what marks a fresh emission.
	const summaries = query.error || query.isLoading ? null : query.data;
	const summariesFetching = summaries !== null && query.isFetching;
	const storedListId =
		selection.status === "ready" ? selection.storedListId : null;
	const currentListId =
		selection.status === "ready" && summaries !== null
			? deriveCurrentListId(storedListId, summaries)
			: null;
	const readySelectionKey = selection.status === "ready" ? selection.key : null;
	const readySelectionInitialRead =
		selection.status === "ready" && selection.initialRead;
	const selectionRefreshing =
		selection.status === "ready" && selection.refreshing;
	const summariesSettled = summaries !== null && !summariesFetching;

	useEffect(() => {
		const guard = selectionClearGuard.current;
		if (guard.selectionKey !== readySelectionKey) {
			guard.selectionKey = readySelectionKey;
			guard.summariesData = summaries;
			guard.observedSummariesAfterSelection =
				readySelectionKey !== null &&
				readySelectionInitialRead &&
				summariesSettled;
			return;
		}
		if (guard.summariesData !== summaries) {
			guard.summariesData = summaries;
			guard.observedSummariesAfterSelection = readySelectionKey !== null;
		}
	}, [
		readySelectionInitialRead,
		readySelectionKey,
		summaries,
		summariesSettled,
	]);

	// `selectList`, `createList`, and `deleteList` write the id they just
	// persisted straight into this ref, so a second action in the same
	// interaction compares against that selection instead of the derived value
	// the pending read has not published yet. This effect hands the ref back to
	// the derived Current List as soon as that read lands, whatever it returns,
	// so a write the read never confirms — because the List stopped being
	// active, or because the read itself failed — cannot pin the ref for the
	// life of the screen.
	useEffect(() => {
		if (selectionRefreshing) return;
		if (currentListId === null) return;
		latestCurrentListIdRef.current = currentListId;
	}, [currentListId, selectionRefreshing]);

	// A stored selection that is no longer an active List is stale: clear it so
	// it cannot shadow a later explicit selection. The in-memory fallback is
	// never persisted. The clear normally waits for a summaries emission after
	// the current selection read so a just-persisted selection is not cleared
	// against a stale trailing-throttled watched-query snapshot; that wait is
	// what `selectionClearGuard` tracks. The first read for a User + Household
	// has no just-persisted selection to protect, so it may clear against an
	// already-settled, non-fetching summaries snapshot.
	// `clearCurrentListSelectionIfMatches` is idempotent, so re-runs on later
	// emissions are no-ops. A clear failure logs and degrades: the fallback List
	// still renders.
	useEffect(() => {
		const canClearAgainstSummaries =
			selectionClearGuard.current.selectionKey === readySelectionKey &&
			selectionClearGuard.current.observedSummariesAfterSelection;
		if (summaries === null || storedListId === null) return;
		if (summariesFetching || !canClearAgainstSummaries) return;
		if (summaries.some((summary) => summary.id === storedListId)) return;
		void selectionStore
			.clearCurrentListSelectionIfMatches(userId, householdId, storedListId)
			.catch((error: unknown) => {
				logger.error("current List selection clear failed", {
					error: asError(error),
				});
			});
	}, [
		householdId,
		logger,
		readySelectionKey,
		selectionStore,
		storedListId,
		summaries,
		summariesFetching,
		userId,
	]);

	const selectList = useCallback(
		async ({ listId }: { listId: string }): Promise<SelectListOutcome> => {
			const currentId = latestCurrentListIdRef.current;
			if (listId === currentId) return { status: "alreadyCurrent" };
			if (selectionWriteInFlightRef.current) {
				return {
					status: "notSelected",
					reason: "busy",
					currentListId: currentId,
				};
			}
			selectionWriteInFlightRef.current = true;
			try {
				await selectionStore.setCurrentListSelection(
					userId,
					householdId,
					listId,
				);
			} catch {
				return {
					status: "notSelected",
					reason: "selectionFailed",
					currentListId: latestCurrentListIdRef.current,
				};
			} finally {
				selectionWriteInFlightRef.current = false;
			}
			latestCurrentListIdRef.current = listId;
			track("list_switched", {
				household_id: householdId,
				list_id: listId,
				user_id: userId,
			});
			refreshSelection();
			return { status: "selected" };
		},
		[householdId, refreshSelection, selectionStore, userId],
	);

	const createList = useCallback(
		async ({ name }: { name: string }): Promise<CreateListOutcome> => {
			let result: CreateListResult;
			try {
				result = await services.lists.createList({ name });
			} catch {
				return { status: "failed" };
			}
			if (result.status === "invalidName") {
				return { status: "invalidName", reason: result.reason };
			}
			try {
				await selectionStore.setCurrentListSelection(
					userId,
					householdId,
					result.list.id,
				);
			} catch {
				return {
					status: "createdSelectionFailed",
					listId: result.list.id,
				};
			}
			latestCurrentListIdRef.current = result.list.id;
			refreshSelection();
			return { status: "createdAndSelected", listId: result.list.id };
		},
		[householdId, refreshSelection, selectionStore, services.lists, userId],
	);

	const renameList = useCallback(
		async ({
			listId,
			name,
		}: {
			listId: string;
			name: string;
		}): Promise<RenameListOutcome> => {
			let result: RenameListResult;
			try {
				result = await services.lists.renameList({ listId, name });
			} catch {
				return { status: "failed" };
			}
			if (result.status === "invalidName") {
				return { status: "invalidName", reason: result.reason };
			}
			if (result.status === "missing" || result.status === "deleted") {
				return { status: "gone" };
			}
			return result.didWrite ? { status: "renamed" } : { status: "unchanged" };
		},
		[services.lists],
	);

	const deleteList = useCallback(
		async ({ listId }: { listId: string }): Promise<DeleteListOutcome> => {
			const wasCurrentList = latestCurrentListIdRef.current === listId;
			let result: DeleteListResult;
			try {
				result = await services.lists.deleteList({ listId });
			} catch {
				return { status: "failed" };
			}
			if (result.status === "missing") return { status: "gone" };
			if (!wasCurrentList) return { status: "deleted" };

			if (!result.didWrite) {
				refreshSelection();
				return { status: "deleted" };
			}

			try {
				const remaining = await services.lists.listLists({
					archive: "active",
					sort: "recentActivity",
				});
				const fallback = remaining[0];
				if (fallback) {
					await selectionStore.setCurrentListSelection(
						userId,
						householdId,
						fallback.id,
					);
					latestCurrentListIdRef.current = fallback.id;
				} else {
					await selectionStore.clearCurrentListSelection(userId, householdId);
					latestCurrentListIdRef.current = null;
				}
			} catch {
				// The live summaries resolver will fall back in memory after refresh.
			}
			refreshSelection();
			return { status: "deleted" };
		},
		[householdId, refreshSelection, selectionStore, services.lists, userId],
	);

	return {
		state: collectionState({
			currentListId,
			query,
			selection,
			summaries: query.data,
		}),
		actions: {
			retry: query.retry,
			selectList,
			createList,
			renameList,
			deleteList,
		},
	};
}

type SelectionClearGuard = {
	selectionKey: string | null;
	summariesData: readonly ListSummary[] | null;
	observedSummariesAfterSelection: boolean;
};

function useStoredCurrentListSelection(
	selectionStore: CurrentListSelectionStore,
	userId: string,
	householdId: string,
): { selection: StoredSelectionState; refreshSelection: () => void } {
	const logger = useLogger();
	const identity = `${userId}:${householdId}`;
	// `epoch` is a trigger token: `refreshSelection` bumps it to re-read the
	// AsyncStorage-backed selection after a switch/create/delete persisted a new
	// one. A refresh read keeps serving the snapshot it is revalidating, so
	// re-reading after a List switch never drops Home back to loading and
	// unmounts the List pager mid-switch. Only a User or Household change has no
	// snapshot left to serve and reports loading. The `cancelled` flag guards
	// against publishing after unmount or after that change.
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
					refreshing: snapshot.epoch !== epoch,
					storedListId: snapshot.storedListId,
				}
			: { status: "loading" };

	useEffect(() => {
		let cancelled = false;
		selectionStore
			.getCurrentListSelection(userId, householdId)
			.catch((error: unknown) => {
				// A failed read behaves like no stored selection: the most recently
				// active List still renders.
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
					// Only the first read for a User + Household has no just-persisted
					// selection to protect from a stale summaries snapshot; a refresh
					// read always follows one.
					initialRead: previous?.identity !== identity,
					storedListId,
				}));
			});
		return () => {
			cancelled = true;
		};
	}, [epoch, householdId, identity, logger, selectionStore, userId]);

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
	// In-memory fallback to the most recently active List (the summaries query's
	// sort order); never persisted.
	return activeSummaries[0]?.id ?? null;
}

function collectionState(input: {
	currentListId: string | null;
	query: {
		data: ListSummary[];
		isLoading: boolean;
		error: Error | undefined;
	};
	selection: StoredSelectionState;
	summaries: ListSummary[];
}): ListCollectionState {
	if (input.query.error) {
		return { status: "error", message: LIST_ERROR_MESSAGE };
	}
	if (input.query.isLoading) return { status: "loading" };
	if (input.selection.status === "loading") {
		return { status: "resolvingCurrentList", summaries: input.summaries };
	}
	if (input.currentListId === null) return { status: "zeroActive" };
	return {
		status: "active",
		summaries: input.summaries,
		currentListId: input.currentListId,
	};
}
