import { useEffect, useReducer } from "react";
import type {
	ActiveListInitialState,
	ActiveListItem,
	AddActiveListItemInput,
} from "@/components/active-list";
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
	| {
			status: "ready";
			initialList: ActiveListInitialState;
			actions: HomeCurrentListActions;
	  };

export function useHomeCurrentList(
	session: AuthenticatedAppSession,
	listId: string,
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

		loadCurrentList(session, listId)
			.then((initialList) => {
				if (!cancelled) {
					dispatch({
						type: "listLoaded",
						loadKey,
						attempt: loadAttempt,
						initialList,
					});
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
	}, [loadAttempt, loadKey, listId, session]);

	const actions = { addItem, loadList, setItemChecked };

	return {
		state: homeCurrentListStateFromResource(resource, loadKey, actions),
		retry: () => dispatch({ type: "retryRequested", loadKey }),
	};
}

type HomeCurrentListResource =
	| { status: "loading"; loadKey: string; attempt: number }
	| { status: "error"; loadKey: string; attempt: number; message: string }
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

	return { status: "ready", initialList: resource.initialList, actions };
}

async function loadCurrentList(
	session: AuthenticatedAppSession,
	listId: string,
): Promise<ActiveListInitialState> {
	const [listResult, items] = await Promise.all([
		session.services.lists.getList({ listId }),
		session.services.items.listItems({ listId }),
	]);
	// Home unwraps `available`; `missing` and `deleted` intentionally keep the
	// generic load-error behavior until the Home resolver task.
	if (listResult.status !== "available") {
		throw new Error(`Current List is not available: ${listResult.status}`);
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
