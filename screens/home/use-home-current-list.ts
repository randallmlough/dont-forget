import { useEffect, useReducer } from "react";
import type {
	ActiveListInitialState,
	ActiveListItem,
	AddActiveListItemInput,
} from "@/components/active-list";
import {
	clearCurrentListSelection,
	getCurrentListSelection,
} from "@/lib/local-storage/current-list-selection";
import type { Item } from "@/lib/services/item";
import type { AuthenticatedAppSession } from "@/lib/services/session";

export type HomeCurrentListActions = {
	loadList: () => Promise<ActiveListInitialState>;
	addItem: (input: AddActiveListItemInput) => Promise<ActiveListItem>;
	setItemChecked: (itemId: string, checked: boolean) => Promise<void>;
};

export type HomeCurrentListState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "zeroActive" }
	| {
			status: "active";
			listId: string;
			initialList: ActiveListInitialState;
			actions: HomeCurrentListActions;
	  };

export function useHomeCurrentList(session: AuthenticatedAppSession): {
	state: HomeCurrentListState;
	retry: () => void;
} {
	const loadKey = session.resourceKey;
	const [resource, dispatch] = useReducer(
		homeCurrentListReducer,
		loadKey,
		initialHomeCurrentListResource,
	);
	const loadAttempt = resource.loadKey === loadKey ? resource.attempt : 0;

	useEffect(() => {
		let cancelled = false;

		resolveCurrentList(session)
			.then((resolution) => {
				if (!cancelled) {
					dispatch({
						type: "listResolved",
						loadKey,
						attempt: loadAttempt,
						resolution,
					});
				}
			})
			.catch(() => {
				if (!cancelled) {
					dispatch({
						type: "listResolutionFailed",
						loadKey,
						attempt: loadAttempt,
						message: "Unable to load this List. Please try again.",
					});
				}
			});

		return () => {
			cancelled = true;
		};
	}, [loadAttempt, loadKey, session]);

	return {
		state: homeCurrentListStateFromResource(resource, loadKey, session),
		retry: () => dispatch({ type: "retryRequested", loadKey }),
	};
}

type HomeCurrentListResolution =
	| { status: "active"; listId: string; initialList: ActiveListInitialState }
	| { status: "zeroActive" };

type HomeCurrentListResource =
	| { status: "loading"; loadKey: string; attempt: number }
	| { status: "error"; loadKey: string; attempt: number; message: string }
	| {
			status: "resolved";
			loadKey: string;
			attempt: number;
			resolution: HomeCurrentListResolution;
	  };

type HomeCurrentListResourceAction =
	| { type: "retryRequested"; loadKey: string }
	| {
			type: "listResolved";
			loadKey: string;
			attempt: number;
			resolution: HomeCurrentListResolution;
	  }
	| {
			type: "listResolutionFailed";
			loadKey: string;
			attempt: number;
			message: string;
	  };

function initialHomeCurrentListResource(
	loadKey: string,
): HomeCurrentListResource {
	return { status: "loading", loadKey, attempt: 0 };
}

function homeCurrentListReducer(
	state: HomeCurrentListResource,
	action: HomeCurrentListResourceAction,
): HomeCurrentListResource {
	if (action.type === "retryRequested") {
		return {
			status: "loading",
			loadKey: action.loadKey,
			attempt: state.loadKey === action.loadKey ? state.attempt + 1 : 0,
		};
	}

	if (state.loadKey === action.loadKey && state.attempt !== action.attempt) {
		return state;
	}

	if (action.type === "listResolved") {
		return {
			status: "resolved",
			loadKey: action.loadKey,
			attempt: action.attempt,
			resolution: action.resolution,
		};
	}

	return {
		status: "error",
		loadKey: action.loadKey,
		attempt: action.attempt,
		message: action.message,
	};
}

function homeCurrentListStateFromResource(
	resource: HomeCurrentListResource,
	loadKey: string,
	session: AuthenticatedAppSession,
): HomeCurrentListState {
	if (resource.loadKey !== loadKey || resource.status === "loading") {
		return { status: "loading" };
	}

	if (resource.status === "error") {
		return { status: "error", message: resource.message };
	}

	if (resource.resolution.status === "zeroActive") {
		return { status: "zeroActive" };
	}

	return {
		status: "active",
		listId: resource.resolution.listId,
		initialList: resource.resolution.initialList,
		actions: homeCurrentListActions(session, resource.resolution.listId),
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
			if (clearStoredSelection) {
				await clearCurrentListSelection(userId, householdId);
			}
			return { status: "active", listId, initialList };
		}
		// Typed missing/deleted lifecycle result: stale candidate, never an error.
		if (listId === storedListId) {
			clearStoredSelection = true;
		}
	}

	if (clearStoredSelection) {
		await clearCurrentListSelection(userId, householdId);
	}
	return { status: "zeroActive" };
}

function homeCurrentListActions(
	session: AuthenticatedAppSession,
	listId: string,
): HomeCurrentListActions {
	return {
		async loadList() {
			const initialList = await loadActiveListState(session, listId);
			// Refresh path for the already-resolved List. Mid-session lifecycle
			// discovery (sync finds it archived/deleted) is out of scope; the
			// ActiveList provider's existing refresh-failure handling applies.
			if (!initialList) {
				throw new Error("Current List is no longer active");
			}
			return initialList;
		},
		async addItem(input: AddActiveListItemInput) {
			const item = await session.services.items.addItem({
				listId,
				userId: session.activeMember.userId,
				name: input.name,
				quantity: input.quantity,
				notes: input.notes,
			});
			return activeListItemFromItem(item, memberNamesFromSession(session));
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
): Promise<ActiveListInitialState | null> {
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
