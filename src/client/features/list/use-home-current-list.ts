import type { useQuery as usePowerSyncQuery } from "@powersync/react";
import { useEffect, useState } from "react";
import {
	clearCurrentListSelectionIfMatches,
	getCurrentListSelection,
} from "@/client/features/list/current-selection";
import type { Item } from "@/client/features/list/item-service";
import type { ListSummary } from "@/client/features/list/list-service";
import { useLogger } from "@/client/lib/logger";
import type { ProductQuery } from "@/client/lib/product-database";
import type { AuthenticatedAppSession } from "@/client/session";
import { asError } from "@/shared/errors";
import type {
	ActiveListItem,
	ActiveListState,
	AddActiveListItemInput,
} from "./list-view-types";
import {
	type ProductServices,
	useProductServices,
} from "./use-product-services";

export type HomeCurrentListActions = {
	addItem: (input: AddActiveListItemInput) => Promise<void>;
	setItemChecked: (itemId: string, checked: boolean) => Promise<void>;
};

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

type PowerSyncWatchedQueryResult<T> = {
	data: T[];
	isLoading: boolean;
	isFetching: boolean;
	error: Error | undefined;
};

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
	// Fresh query objects per render are fine: useQuery re-keys on compiled
	// SQL + parameters, not object identity.
	const summaries = useQuery<ListSummary>(
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
	const items = useQuery<Item>(
		services.items.listItemsQuery({ listId: currentListId ?? "" }),
	);

	// A stored selection that is no longer an active List is stale: clear it
	// so it cannot shadow a later explicit selection. The in-memory fallback
	// is never persisted. `clearCurrentListSelectionIfMatches` is idempotent,
	// so re-runs on later summary emissions are no-ops. Failures log and
	// degrade: the fallback List still renders (Decision 5).
	useEffect(() => {
		if (!summariesReady || storedListId === null) return;
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
		summaries.data,
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
	| { status: "ready"; storedListId: string | null };

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
	const memberNames = memberNamesFromSession(input.session);
	// Right after a switch the watched Items query may briefly still hold the
	// previous List's rows (the SDK keeps data while re-running on a
	// parameter change); rows are List-scoped, so filter (Decision 7).
	const itemRows = input.items.data.filter(
		(item) => item.listId === input.currentListId,
	);
	return {
		status: "active",
		listId: input.currentListId,
		list: {
			householdName: input.session.activeHousehold.name,
			listName: summary.name,
			items: itemRows.map((item) => activeListItemFromItem(item, memberNames)),
		},
		actions: homeCurrentListActions(
			input.session,
			input.services,
			input.currentListId,
		),
	};
}

function homeCurrentListActions(
	session: AuthenticatedAppSession,
	services: ProductServices,
	listId: string,
): HomeCurrentListActions {
	return {
		async addItem(input: AddActiveListItemInput) {
			await services.items.addItem({
				listId,
				userId: session.activeMember.userId,
				name: input.name,
				quantity: input.quantity,
				notes: input.notes,
			});
		},
		async setItemChecked(itemId: string, checked: boolean) {
			await services.items.setItemChecked({
				listId,
				itemId,
				userId: session.activeMember.userId,
				checked,
			});
		},
	};
}

function memberNamesFromSession(
	session: AuthenticatedAppSession,
): Map<string, string | null> {
	const names = new Map<string, string | null>();
	for (const member of session.members) {
		names.set(member.userId, member.displayName);
	}
	names.set(
		session.activeMember.userId,
		session.activeMember.displayName ??
			session.user.displayName ??
			session.user.email ??
			"Member",
	);
	return names;
}

function activeListItemFromItem(
	item: Item,
	memberNames: Map<string, string | null>,
): ActiveListItem {
	return {
		id: item.id,
		name: item.name,
		quantity: item.quantity,
		notes: item.notes,
		checked: item.checked,
		checkedByMemberName:
			item.checked && item.checkedByUserId
				? (memberNames.get(item.checkedByUserId) ?? null)
				: null,
	};
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
