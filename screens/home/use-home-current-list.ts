import { useEffect, useReducer } from "react";
import type {
	ActiveListInitialState,
	ActiveListItem,
	AddActiveListItemInput,
} from "@/components/active-list";
import type { Item } from "@/lib/services/item";
import type { GetListResult } from "@/lib/services/list";
import type { AuthenticatedAppSession } from "@/lib/services/session";

export type HomeCurrentListActions = {
	loadList: () => Promise<ActiveListInitialState>;
	addItem: (input: AddActiveListItemInput) => Promise<ActiveListItem>;
	setItemChecked: (itemId: string, checked: boolean) => Promise<void>;
};

export type HomeCurrentListState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "unavailable"; listId: string }
	| {
			status: "ready";
			initialList: ActiveListInitialState;
			actions: HomeCurrentListActions;
	  };

export type HomeCurrentListOptions = {
	onUnavailable?: (listId: string) => void;
};

export function useHomeCurrentList(
	session: AuthenticatedAppSession,
	listId: string,
	options: HomeCurrentListOptions = {},
): {
	state: HomeCurrentListState;
	retry: () => void;
} {
	const loadKey = `${session.resourceKey}:${listId}`;
	const [resource, dispatch] = useReducer(
		homeCurrentListReducer,
		loadKey,
		initialHomeCurrentListResource,
	);
	const loadAttempt = resource.loadKey === loadKey ? resource.attempt : 0;
	const { onUnavailable } = options;

	async function loadList(): Promise<ActiveListInitialState> {
		return loadCurrentList(session, listId);
	}

	async function addItem(
		input: AddActiveListItemInput,
	): Promise<ActiveListItem> {
		const item = await session.services.items.addItem({
			listId,
			userId: session.activeMember.userId,
			name: input.name,
			quantity: input.quantity,
			notes: input.notes,
		});
		return activeListItemFromItem(item, memberNamesFromSession(session));
	}

	async function setItemChecked(itemId: string, checked: boolean) {
		await session.services.items.setItemChecked({
			listId,
			itemId,
			userId: session.activeMember.userId,
			checked,
		});
	}

	useEffect(() => {
		let cancelled = false;

		loadCurrentListForHome(session, listId)
			.then((result) => {
				if (!cancelled) {
					if (result.status === "unavailable") {
						onUnavailable?.(result.listId);
						dispatch({
							type: "listUnavailable",
							loadKey,
							attempt: loadAttempt,
							listId: result.listId,
						});
					} else {
						dispatch({
							type: "listLoaded",
							loadKey,
							attempt: loadAttempt,
							initialList: result.initialList,
						});
					}
				}
			})
			.catch(() => {
				if (!cancelled) {
					dispatch({
						type: "listLoadFailed",
						loadKey,
						attempt: loadAttempt,
						message: "Unable to load this List. Please try again.",
					});
				}
			});

		return () => {
			cancelled = true;
		};
	}, [loadAttempt, loadKey, listId, onUnavailable, session]);

	const actions = { addItem, loadList, setItemChecked };

	return {
		state: homeCurrentListStateFromResource(resource, loadKey, actions),
		retry: () => dispatch({ type: "retryRequested", loadKey }),
	};
}

type HomeCurrentListResource =
	| { status: "loading"; loadKey: string; attempt: number }
	| { status: "error"; loadKey: string; attempt: number; message: string }
	| { status: "unavailable"; loadKey: string; attempt: number; listId: string }
	| {
			status: "ready";
			loadKey: string;
			attempt: number;
			initialList: ActiveListInitialState;
	  };

type HomeCurrentListResourceAction =
	| { type: "retryRequested"; loadKey: string }
	| {
			type: "listLoaded";
			loadKey: string;
			attempt: number;
			initialList: ActiveListInitialState;
	  }
	| {
			type: "listUnavailable";
			loadKey: string;
			attempt: number;
			listId: string;
	  }
	| {
			type: "listLoadFailed";
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

	if (action.type === "listLoaded") {
		return {
			status: "ready",
			loadKey: action.loadKey,
			attempt: action.attempt,
			initialList: action.initialList,
		};
	}

	if (action.type === "listUnavailable") {
		return {
			status: "unavailable",
			loadKey: action.loadKey,
			attempt: action.attempt,
			listId: action.listId,
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
	actions: HomeCurrentListActions,
): HomeCurrentListState {
	if (resource.loadKey !== loadKey || resource.status === "loading") {
		return { status: "loading" };
	}

	if (resource.status === "error") {
		return { status: "error", message: resource.message };
	}

	if (resource.status === "unavailable") {
		return { status: "unavailable", listId: resource.listId };
	}

	return { status: "ready", initialList: resource.initialList, actions };
}

async function loadCurrentList(
	session: AuthenticatedAppSession,
	listId: string,
): Promise<ActiveListInitialState> {
	const result = await loadCurrentListForHome(session, listId);
	if (result.status === "unavailable") {
		throw new Error("List is not available");
	}
	return result.initialList;
}

type HomeCurrentListLoadResult =
	| { status: "ready"; initialList: ActiveListInitialState }
	| {
			status: "unavailable";
			listId: string;
			reason: Exclude<GetListResult["status"], "available">;
	  };

async function loadCurrentListForHome(
	session: AuthenticatedAppSession,
	listId: string,
): Promise<HomeCurrentListLoadResult> {
	const [listResult, items] = await Promise.all([
		session.services.lists.getList({ listId }),
		session.services.items.listItems({ listId }),
	]);
	if (listResult.status !== "available") {
		return { status: "unavailable", listId, reason: listResult.status };
	}
	const memberNames = memberNamesFromSession(session);

	return {
		status: "ready",
		initialList: {
			householdName: session.activeHousehold.name,
			listName: listResult.list.name,
			items: items.map((item) => activeListItemFromItem(item, memberNames)),
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
