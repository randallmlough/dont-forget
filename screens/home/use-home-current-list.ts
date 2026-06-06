import { useEffect, useReducer } from "react";
import type {
	ActiveListInitialState,
	ActiveListItem,
	AddActiveListItemInput,
} from "@/components/active-list";
import type {
	ArchiveListResult,
	CreateListResult,
	DeleteListResult,
	ListListsInput,
	ListSummary,
	RenameListResult,
	UnarchiveListResult,
} from "@/lib/services/list";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { createHomeCurrentListController } from "./home-current-list-controller";
import { resolveAndLoadCurrentList } from "./home-current-list-lifecycle";
import { useHomeCurrentListOperations } from "./use-home-current-list-operations";

export type HomeCreateListResult =
	| { status: "created" }
	| Extract<CreateListResult, { status: "invalid" }>
	| { status: "failed" };

export type HomeRenameListResult =
	| { status: "renamed" }
	| { status: "unchanged" }
	| Extract<RenameListResult, { status: "invalid" | "missing" | "deleted" }>
	| { status: "failed" };

export type HomeArchiveListResult =
	| { status: "archived" }
	| { status: "unchanged" }
	| Extract<ArchiveListResult, { status: "missing" | "deleted" }>
	| { status: "failed" };

export type HomeUnarchiveListResult =
	| { status: "unarchived" }
	| { status: "unchanged" }
	| Extract<UnarchiveListResult, { status: "missing" | "deleted" }>
	| { status: "failed" };

export type HomeDeleteListResult =
	| { status: "deleted" }
	| Extract<DeleteListResult, { status: "already-deleted" | "missing" }>
	| { status: "failed" };

export type HomeCurrentListActions = {
	archiveList: (listId: string) => Promise<HomeArchiveListResult>;
	createList: (name: string) => Promise<HomeCreateListResult>;
	deleteList: (listId: string) => Promise<HomeDeleteListResult>;
	renameList: (listId: string, name: string) => Promise<HomeRenameListResult>;
	unarchiveList: (listId: string) => Promise<HomeUnarchiveListResult>;
	loadList: () => Promise<ActiveListInitialState>;
	loadListSummaries: (input: ListListsInput) => Promise<ListSummary[]>;
	addItem: (input: AddActiveListItemInput) => Promise<ActiveListItem>;
	selectList: (listId: string) => Promise<boolean>;
	setItemChecked: (itemId: string, checked: boolean) => Promise<void>;
};

export type HomeCurrentListState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| {
			status: "zero-active";
			hasArchivedLists: boolean;
			isCreating: boolean;
			actions: Pick<HomeCurrentListActions, "createList" | "unarchiveList">;
	  }
	| {
			status: "deleted-current";
			activeLists: ListSummary[];
			hasArchivedLists: boolean;
			isCreating: boolean;
			isSwitching: boolean;
			actions: Pick<
				HomeCurrentListActions,
				| "createList"
				| "deleteList"
				| "loadListSummaries"
				| "selectList"
				| "unarchiveList"
			>;
	  }
	| {
			status: "ready";
			activeLists: ListSummary[];
			currentList: ListSummary;
			hasArchivedLists: boolean;
			initialList: ActiveListInitialState;
			isCreating: boolean;
			isRenaming: boolean;
			isSwitching: boolean;
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
	const operations = useHomeCurrentListOperations();
	const loadAttempt = resource.loadKey === loadKey ? resource.attempt : 0;
	const actions = createHomeCurrentListController({
		session,
		resource,
		loadKey,
		loadAttempt,
		operations,
		dispatch,
	});

	useEffect(() => {
		operations.markMounted();
		let cancelled = false;

		resolveAndLoadCurrentList(session)
			.then((resolved) => {
				if (!cancelled) {
					if (resolved.status === "zero-active") {
						dispatch({
							type: "zeroActive",
							loadKey,
							attempt: loadAttempt,
							hasArchivedLists: resolved.hasArchivedLists,
						});
						return;
					}
					if (resolved.status === "deleted-current") {
						dispatch({
							type: "deletedCurrent",
							loadKey,
							attempt: loadAttempt,
							activeLists: resolved.activeLists,
							hasArchivedLists: resolved.hasArchivedLists,
						});
						return;
					}

					dispatch({
						type: "listReady",
						loadKey,
						attempt: loadAttempt,
						activeLists: resolved.activeLists,
						currentList: resolved.currentList,
						hasArchivedLists: resolved.hasArchivedLists,
						initialList: resolved.initialList,
						isCreating: false,
						isRenaming: false,
						isSwitching: false,
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

export type HomeCurrentListResource =
	| { status: "loading"; loadKey: string; attempt: number }
	| { status: "error"; loadKey: string; attempt: number; message: string }
	| {
			status: "zero-active";
			loadKey: string;
			attempt: number;
			hasArchivedLists: boolean;
			isCreating: boolean;
	  }
	| {
			status: "deleted-current";
			loadKey: string;
			attempt: number;
			activeLists: ListSummary[];
			hasArchivedLists: boolean;
			isCreating: boolean;
			isSwitching: boolean;
	  }
	| {
			status: "ready";
			loadKey: string;
			attempt: number;
			activeLists: ListSummary[];
			currentList: ListSummary;
			hasArchivedLists: boolean;
			initialList: ActiveListInitialState;
			isCreating: boolean;
			isRenaming: boolean;
			isSwitching: boolean;
	  };

export type HomeCurrentListResourceAction =
	| { type: "retryRequested"; loadKey: string }
	| {
			type: "listReady";
			loadKey: string;
			attempt: number;
			activeLists: ListSummary[];
			currentList: ListSummary;
			hasArchivedLists: boolean;
			initialList: ActiveListInitialState;
			isCreating: boolean;
			isRenaming: boolean;
			isSwitching: boolean;
	  }
	| {
			type: "deletedCurrent";
			loadKey: string;
			attempt: number;
			activeLists: ListSummary[];
			hasArchivedLists: boolean;
	  }
	| {
			type: "createStarted" | "createFinished";
			loadKey: string;
			attempt: number;
	  }
	| {
			type: "renameStarted" | "renameFinished";
			loadKey: string;
			attempt: number;
	  }
	| {
			type: "switchStarted";
			loadKey: string;
			attempt: number;
	  }
	| {
			type: "switchFinished";
			loadKey: string;
			attempt: number;
	  }
	| {
			type: "zeroActive";
			loadKey: string;
			attempt: number;
			hasArchivedLists: boolean;
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
