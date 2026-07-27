import { useCallback, useEffect, useRef, useState } from "react";
import {
	clearCurrentListSelection,
	clearCurrentListSelectionIfMatches,
	getCurrentListSelection,
	setCurrentListSelection,
} from "@/client/features/list/current-selection";
import type {
	CreateListResult,
	DeleteListResult,
	ListNameValidationError,
	ListSummary,
	RenameListResult,
} from "@/client/features/list/list-service";
import { track } from "@/client/lib/analytics";
import { useLogger } from "@/client/lib/logger";
import {
	useProductQuery,
	withProductQueryRetryKey,
} from "@/client/lib/use-product-query";
import type { AuthenticatedAppSession } from "@/client/session";
import { asError } from "@/shared/errors";
import { useProductServices } from "./use-product-services";

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
			storedListId: string | null;
	  };

type StoredSelectionSnapshot = {
	identity: string;
	epoch: number;
	initialRead: boolean;
	storedListId: string | null;
};

export function useListCollection(
	session: AuthenticatedAppSession,
): ListCollection {
	const userId = session.activeMember.userId;
	const householdId = session.activeHousehold.id;
	const logger = useLogger();
	const services = useProductServices({ householdId, userId });
	const [retryEpoch, setRetryEpoch] = useState(0);
	const { selection, refreshSelection } = useStoredCurrentListSelection(
		userId,
		householdId,
	);
	const query = useProductQuery<ListSummary>(
		withProductQueryRetryKey(
			services.lists.listListsQuery({
				archive: "active",
				sort: "recentActivity",
			}),
			retryEpoch,
		),
	);
	const selectionClearGuard = useRef<SelectionClearGuard>({
		selectionKey: null,
		summariesData: null,
		observedSummariesAfterSelection: false,
	});
	const latestCurrentListIdRef = useRef<string | null>(null);
	const selectionOverrideRef = useRef<string | null>(null);
	const selectionWriteInFlightRef = useRef(false);
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

	useEffect(() => {
		if (currentListId === null) return;
		const override = selectionOverrideRef.current;
		if (override !== null && currentListId !== override) return;
		latestCurrentListIdRef.current = currentListId;
		if (override === currentListId) selectionOverrideRef.current = null;
	}, [currentListId]);

	useEffect(() => {
		const canClearAgainstSummaries =
			selectionClearGuard.current.selectionKey === readySelectionKey &&
			selectionClearGuard.current.observedSummariesAfterSelection;
		if (summaries === null || storedListId === null) return;
		if (summariesFetching || !canClearAgainstSummaries) return;
		if (summaries.some((summary) => summary.id === storedListId)) return;
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
		householdId,
		logger,
		readySelectionKey,
		storedListId,
		summaries,
		summariesFetching,
		userId,
	]);

	const retry = useCallback(() => {
		setRetryEpoch((epoch) => epoch + 1);
	}, []);

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
				await setCurrentListSelection(userId, householdId, listId);
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
			selectionOverrideRef.current = listId;
			track("list_switched", {
				household_id: householdId,
				list_id: listId,
				user_id: userId,
			});
			refreshSelection();
			return { status: "selected" };
		},
		[householdId, refreshSelection, userId],
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
				await setCurrentListSelection(userId, householdId, result.list.id);
			} catch {
				return {
					status: "createdSelectionFailed",
					listId: result.list.id,
				};
			}
			latestCurrentListIdRef.current = result.list.id;
			selectionOverrideRef.current = result.list.id;
			refreshSelection();
			return { status: "createdAndSelected", listId: result.list.id };
		},
		[householdId, refreshSelection, services.lists, userId],
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
			let result: DeleteListResult;
			try {
				result = await services.lists.deleteList({ listId });
			} catch {
				return { status: "failed" };
			}
			if (result.status === "missing") return { status: "gone" };
			if (latestCurrentListIdRef.current !== listId)
				return { status: "deleted" };

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
					await setCurrentListSelection(userId, householdId, fallback.id);
					latestCurrentListIdRef.current = fallback.id;
					selectionOverrideRef.current = fallback.id;
				} else {
					await clearCurrentListSelection(userId, householdId);
					latestCurrentListIdRef.current = null;
					selectionOverrideRef.current = null;
				}
			} catch {
				// The live summaries resolver will fall back in memory after refresh.
			}
			refreshSelection();
			return { status: "deleted" };
		},
		[householdId, refreshSelection, services.lists, userId],
	);

	return {
		state: collectionState({
			currentListId,
			query,
			selection,
			summaries: query.data,
		}),
		actions: { retry, selectList, createList, renameList, deleteList },
	};
}

type SelectionClearGuard = {
	selectionKey: string | null;
	summariesData: readonly ListSummary[] | null;
	observedSummariesAfterSelection: boolean;
};

function useStoredCurrentListSelection(
	userId: string,
	householdId: string,
): { selection: StoredSelectionState; refreshSelection: () => void } {
	const logger = useLogger();
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
					initialRead: previous?.identity !== identity,
					storedListId,
				}));
			});
		return () => {
			cancelled = true;
		};
	}, [epoch, householdId, identity, logger, userId]);

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
