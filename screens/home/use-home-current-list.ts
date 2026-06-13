import type {
	ActiveListItem,
	ActiveListState,
	AddActiveListItemInput,
} from "@/components/active-list";
import { useSessionQuery } from "@/components/session";
import {
	clearCurrentListSelectionIfMatches,
	getCurrentListSelection,
} from "@/lib/local-storage/current-list-selection";
import type { Item } from "@/lib/services/item";
import type { AuthenticatedAppSession } from "@/lib/services/session";

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

export function useHomeCurrentList(session: AuthenticatedAppSession): {
	state: HomeCurrentListState;
	retry: () => void;
	reload: () => void;
} {
	const query = useSessionQuery({
		session,
		loadKey: session.resourceKey,
		load: () => resolveCurrentList(session),
		errorMessage: "Unable to load this List. Please try again.",
	});

	return {
		state: homeCurrentListStateFromQuery(query.state),
		retry: query.reload,
		// Current List selection lives in AsyncStorage, so switch/create/delete
		// flows reset and re-resolve after persisting a new selection.
		reload: query.reload,
	};
}

type HomeCurrentListResolution =
	| {
			status: "active";
			listId: string;
			list: ActiveListState;
			actions: HomeCurrentListActions;
	  }
	| { status: "zeroActive" };

function homeCurrentListStateFromQuery(
	queryState:
		| { status: "loading" }
		| { status: "error"; message: string }
		| { status: "ready"; data: HomeCurrentListResolution },
): HomeCurrentListState {
	if (queryState.status === "loading") {
		return { status: "loading" };
	}

	if (queryState.status === "error") {
		return { status: "error", message: queryState.message };
	}

	if (queryState.data.status === "zeroActive") {
		return { status: "zeroActive" };
	}

	return {
		status: "active",
		listId: queryState.data.listId,
		list: queryState.data.list,
		actions: queryState.data.actions,
	};
}

/**
 * Resolves the Current List for Home:
 *
 * 1. Read the local Current List selection for the active Member + Household.
 * 2. Validate it against the active `listLists()` snapshot; a stored selection
 *    absent from the snapshot (archived, deleted, missing locally, corrupt id)
 *    is invalid and gets cleared.
 * 3. Load the stored selection when valid, otherwise fall back IN MEMORY to
 *    the most recently active List. Fallback is never persisted.
 * 4. Typed `missing`/`deleted` (or archived-in-race) `getList()` results mark
 *    the candidate stale: skip it and continue with the remaining snapshot
 *    candidates. The loop is bounded by the single snapshot — each candidate
 *    is attempted at most once and `listLists()` is not re-queried.
 *
 * Thrown infrastructure failures propagate to the retryable List error state.
 */
async function resolveCurrentList(
	session: AuthenticatedAppSession,
): Promise<HomeCurrentListResolution> {
	const userId = session.activeMember.userId;
	const householdId = session.activeHousehold.id;
	const storedListId = await getCurrentListSelection(userId, householdId);
	const summaries = await session.services.lists.listLists({
		archive: "active",
		sort: "recentActivity",
	});
	const activeListIds = summaries.map((summary) => summary.id);
	const storedCandidateId =
		storedListId !== null && activeListIds.includes(storedListId)
			? storedListId
			: null;
	let clearStoredSelection =
		storedListId !== null && storedCandidateId === null;
	const candidateListIds =
		storedCandidateId !== null
			? [
					storedCandidateId,
					...activeListIds.filter((listId) => listId !== storedCandidateId),
				]
			: activeListIds;

	for (const listId of candidateListIds) {
		const initialList = await loadActiveListState(session, listId);
		if (initialList) {
			if (clearStoredSelection && storedListId !== null) {
				await clearCurrentListSelectionIfMatches(
					userId,
					householdId,
					storedListId,
				);
			}
			return {
				status: "active",
				listId,
				list: initialList,
				actions: homeCurrentListActions(session, listId),
			};
		}
		// Typed missing/deleted lifecycle result: stale candidate, never an error.
		if (listId === storedListId) {
			clearStoredSelection = true;
		}
	}

	if (clearStoredSelection && storedListId !== null) {
		await clearCurrentListSelectionIfMatches(userId, householdId, storedListId);
	}
	return { status: "zeroActive" };
}

function homeCurrentListActions(
	session: AuthenticatedAppSession,
	listId: string,
): HomeCurrentListActions {
	return {
		async addItem(input: AddActiveListItemInput) {
			await session.services.items.addItem({
				listId,
				userId: session.activeMember.userId,
				name: input.name,
				quantity: input.quantity,
				notes: input.notes,
			});
		},
		async setItemChecked(itemId: string, checked: boolean) {
			await session.services.items.setItemChecked({
				listId,
				itemId,
				userId: session.activeMember.userId,
				checked,
			});
		},
	};
}

async function loadActiveListState(
	session: AuthenticatedAppSession,
	listId: string,
): Promise<ActiveListState | null> {
	const [listResult, items] = await Promise.all([
		session.services.lists.getList({ listId }),
		session.services.items.listItems({ listId }),
	]);
	// `listLists({ archive: "active" })` already excludes archived Lists; the
	// `archived` check covers a List archived between the two reads, since
	// `getList` reports archived Lists as available.
	if (listResult.status !== "available" || listResult.list.archived) {
		return null;
	}
	const memberNames = memberNamesFromSession(session);

	return {
		householdName: session.activeHousehold.name,
		listName: listResult.list.name,
		items: items.map((item) => activeListItemFromItem(item, memberNames)),
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
