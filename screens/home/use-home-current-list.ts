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
			operations.cancelAll();
		};
	}, [loadAttempt, loadKey, operations, session]);

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

	if (resource.status === "zero-active") {
		return {
			status: "zero-active",
			hasArchivedLists: resource.hasArchivedLists,
			isCreating: resource.isCreating,
			actions: {
				createList: actions.createList,
				unarchiveList: actions.unarchiveList,
			},
		};
	}

	if (resource.status === "deleted-current") {
		return {
			status: "deleted-current",
			activeLists: resource.activeLists,
			hasArchivedLists: resource.hasArchivedLists,
			isCreating: resource.isCreating,
			isSwitching: resource.isSwitching,
			actions: {
				createList: actions.createList,
				deleteList: actions.deleteList,
				loadListSummaries: actions.loadListSummaries,
				selectList: actions.selectList,
				unarchiveList: actions.unarchiveList,
			},
		};
	}

	return {
		status: "ready",
		activeLists: resource.activeLists,
		currentList: resource.currentList,
		hasArchivedLists: resource.hasArchivedLists,
		initialList: resource.initialList,
		isCreating: resource.isCreating,
		isRenaming: resource.isRenaming,
		isSwitching: resource.isSwitching,
		actions,
	};
}
