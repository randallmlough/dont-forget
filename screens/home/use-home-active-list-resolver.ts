import { useEffect, useReducer } from "react";
import {
	clearCurrentListSelection,
	getCurrentListSelection,
} from "@/lib/local-storage";
import type { ListSummary } from "@/lib/services/list";
import type { AuthenticatedAppSession } from "@/lib/services/session";

const emptyExcludedListIds: string[] = [];

export type HomeActiveListResolverState =
	| { status: "loading" }
	| { status: "active"; listId: string }
	| { status: "zeroActive" }
	| { status: "error"; message: string };

export function useHomeActiveListResolver(session: AuthenticatedAppSession): {
	state: HomeActiveListResolverState;
	retry: () => void;
} {
	return useHomeActiveListResolverWithExclusions(session, emptyExcludedListIds);
}

export function useHomeActiveListResolverWithExclusions(
	session: AuthenticatedAppSession,
	excludedListIds: string[],
): {
	state: HomeActiveListResolverState;
	retry: () => void;
} {
	const loadKey = session.resourceKey;
	const [resource, dispatch] = useReducer(
		homeActiveListResolverReducer,
		loadKey,
		initialHomeActiveListResolverResource,
	);
	const loadAttempt = resource.loadKey === loadKey ? resource.attempt : 0;

	useEffect(() => {
		let cancelled = false;

		resolveHomeActiveList(session, excludedListIds)
			.then((state) => {
				if (!cancelled) {
					dispatch({
						type: "resolved",
						loadKey,
						attempt: loadAttempt,
						state,
					});
				}
			})
			.catch(() => {
				if (!cancelled) {
					dispatch({
						type: "failed",
						loadKey,
						attempt: loadAttempt,
						message: "Unable to load this List. Please try again.",
					});
				}
			});

		return () => {
			cancelled = true;
		};
	}, [excludedListIds, loadAttempt, loadKey, session]);

	return {
		state: homeActiveListResolverStateFromResource(resource, loadKey),
		retry: () => dispatch({ type: "retryRequested", loadKey }),
	};
}

type HomeActiveListResolverResource = HomeActiveListResolverState & {
	loadKey: string;
	attempt: number;
};

type HomeActiveListResolverResourceAction =
	| { type: "retryRequested"; loadKey: string }
	| {
			type: "resolved";
			loadKey: string;
			attempt: number;
			state: Exclude<HomeActiveListResolverState, { status: "loading" }>;
	  }
	| { type: "failed"; loadKey: string; attempt: number; message: string };

function initialHomeActiveListResolverResource(
	loadKey: string,
): HomeActiveListResolverResource {
	return { status: "loading", loadKey, attempt: 0 };
}

function homeActiveListResolverReducer(
	state: HomeActiveListResolverResource,
	action: HomeActiveListResolverResourceAction,
): HomeActiveListResolverResource {
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

	if (action.type === "resolved") {
		return {
			...action.state,
			loadKey: action.loadKey,
			attempt: action.attempt,
		};
	}

	return {
		status: "error",
		loadKey: action.loadKey,
		attempt: action.attempt,
		message: action.message,
	};
}

function homeActiveListResolverStateFromResource(
	resource: HomeActiveListResolverResource,
	loadKey: string,
): HomeActiveListResolverState {
	if (resource.loadKey !== loadKey || resource.status === "loading") {
		return { status: "loading" };
	}

	if (resource.status === "active") {
		return { status: "active", listId: resource.listId };
	}

	if (resource.status === "zeroActive") {
		return { status: "zeroActive" };
	}

	return { status: "error", message: resource.message };
}

async function resolveHomeActiveList(
	session: AuthenticatedAppSession,
	excludedListIds: string[],
): Promise<Exclude<HomeActiveListResolverState, { status: "loading" }>> {
	const userId = session.user.id;
	const householdId = session.activeHousehold.id;
	const [storedListId, activeLists] = await Promise.all([
		getCurrentListSelection(userId, householdId),
		session.services.lists.listLists({
			archive: "active",
			sort: "recentActivity",
		}),
	]);
	const activeListIds = new Set(activeLists.map((list) => list.id));
	const excludedListIdSet = new Set(excludedListIds);

	if (storedListId) {
		if (
			!activeListIds.has(storedListId) ||
			excludedListIdSet.has(storedListId)
		) {
			await clearCurrentListSelection(userId, householdId);
		} else {
			const storedCandidate = await resolveCandidate(session, storedListId);
			if (storedCandidate.status === "active") {
				return storedCandidate;
			}

			excludedListIdSet.add(storedListId);
			await clearCurrentListSelection(userId, householdId);
		}
	}

	return resolveFallbackCandidate(session, activeLists, excludedListIdSet);
}

async function resolveFallbackCandidate(
	session: AuthenticatedAppSession,
	activeLists: ListSummary[],
	excludedListIds: Set<string>,
): Promise<Exclude<HomeActiveListResolverState, { status: "loading" }>> {
	for (const list of activeLists) {
		if (excludedListIds.has(list.id)) continue;

		const candidate = await resolveCandidate(session, list.id);
		if (candidate.status === "active") {
			return candidate;
		}

		excludedListIds.add(list.id);
	}

	return { status: "zeroActive" };
}

async function resolveCandidate(
	session: AuthenticatedAppSession,
	listId: string,
): Promise<{ status: "active"; listId: string } | { status: "stale" }> {
	const result = await session.services.lists.getList({ listId });
	if (result.status !== "available" || result.list.archived) {
		return { status: "stale" };
	}

	return { status: "active", listId };
}
