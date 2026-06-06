import type {
	ActiveListInitialState,
	ActiveListItem,
} from "@/components/active-list";
import { asError } from "@/lib/errors";
import { currentListSelectionStore } from "@/lib/local-storage/current-list-selection";
import { logger } from "@/lib/logger";
import type { Item } from "@/lib/services/item";
import type { List, ListSummary } from "@/lib/services/list";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { resolveHomeCurrentList } from "./current-list-resolver";
import type {
	HomeCurrentListResource,
	HomeCurrentListResourceAction,
} from "./use-home-current-list";
import type { HomeCurrentListOperations } from "./use-home-current-list-operations";

export type HomeCurrentListControllerInput = {
	session: AuthenticatedAppSession;
	resource: HomeCurrentListResource;
	loadKey: string;
	loadAttempt: number;
	operations: HomeCurrentListOperations;
	dispatch: (action: HomeCurrentListResourceAction) => void;
};

export type ReadyResource = Extract<
	HomeCurrentListResource,
	{ status: "ready" }
>;

export type ControllerOperation =
	| "archive"
	| "create"
	| "delete"
	| "rename"
	| "switch"
	| "unarchive";

type ControllerStatus = HomeCurrentListResource["status"];
type OperationStartAction = "createStarted" | "renameStarted" | "switchStarted";
type OperationFinishAction =
	| "createFinished"
	| "renameFinished"
	| "switchFinished";

type LoadedCurrentListResult =
	| { status: "ready"; initialList: ActiveListInitialState; list: List }
	| { status: "missing" }
	| { status: "deleted" };

export type OperationRunContext = {
	requestId: number;
	isActive: () => boolean;
	requestSync: () => void;
};

type OperationRunOptions<TResult> = {
	allowedStatuses: ControllerStatus[];
	failedResult: TResult;
	finishAction?: OperationFinishAction;
	operation: ControllerOperation;
	run: (context: OperationRunContext) => Promise<TResult>;
	startAction?: OperationStartAction;
};

export async function runHomeCurrentListOperation<TResult>(
	input: HomeCurrentListControllerInput,
	options: OperationRunOptions<TResult>,
): Promise<TResult> {
	if (
		!input.operations.mounted.current ||
		input.resource.loadKey !== input.loadKey ||
		!options.allowedStatuses.includes(input.resource.status)
	) {
		return options.failedResult;
	}

	const requestId = input.operations.begin(options.operation);
	if (requestId === null) return options.failedResult;
	if (options.startAction) {
		input.dispatch({
			type: options.startAction,
			loadKey: input.loadKey,
			attempt: input.loadAttempt,
		});
	}

	const context: OperationRunContext = {
		requestId,
		isActive: () => isActive(input, options.operation, requestId),
		requestSync: () => {
			void input.session.services.sync
				.requestSync({ reason: "localWrite" })
				.catch(() => undefined);
		},
	};

	try {
		return await options.run(context);
	} catch (error) {
		logger
			.with({
				household_id: input.session.activeHousehold.id,
				operation: options.operation,
				service: "home-current-list",
			})
			.error("Home Current List operation failed", {
				error: asError(error),
			});
		return options.failedResult;
	} finally {
		if (input.operations.finish(options.operation, requestId)) {
			if (options.finishAction) {
				input.dispatch({
					type: options.finishAction,
					loadKey: input.loadKey,
					attempt: input.loadAttempt,
				});
			}
		}
	}
}

export function isActive(
	input: HomeCurrentListControllerInput,
	operation: ControllerOperation,
	requestId: number,
): boolean {
	return input.operations.isActive(operation, requestId);
}

function canCommitOperation(
	input: HomeCurrentListControllerInput,
	operation: ControllerOperation | null,
	requestId: number | null,
): boolean {
	if (!input.operations.mounted.current) return false;
	if (input.resource.loadKey !== input.loadKey) return false;
	if (operation === null || requestId === null) return true;
	return isActive(input, operation, requestId);
}

type DispatchResolvedOptions = {
	operation: ControllerOperation | null;
	requestId: number | null;
	isRenaming: boolean;
	isSwitching: boolean;
};

export async function dispatchResolvedCurrentList(
	input: HomeCurrentListControllerInput,
	options: DispatchResolvedOptions,
): Promise<boolean> {
	if (!canCommitOperation(input, options.operation, options.requestId)) {
		return false;
	}

	const resolved = await resolveAndLoadCurrentList(input.session);
	if (!canCommitOperation(input, options.operation, options.requestId)) {
		return false;
	}

	dispatchResolvedResource(input, resolved, {
		isRenaming: options.isRenaming,
		isSwitching: options.isSwitching,
	});
	return (
		resolved.status !== "deleted-current" || options.operation !== "unarchive"
	);
}

export async function dispatchDeletedCurrent(
	input: HomeCurrentListControllerInput,
	options: Pick<DispatchResolvedOptions, "operation" | "requestId">,
): Promise<boolean> {
	if (!canCommitOperation(input, options.operation, options.requestId)) {
		return false;
	}

	const [activeLists, archivedLists] = await Promise.all([
		input.session.services.lists.listLists({ archive: "active" }),
		input.session.services.lists.listLists({ archive: "archived" }),
	]);
	if (!canCommitOperation(input, options.operation, options.requestId)) {
		return false;
	}

	input.dispatch({
		type: "deletedCurrent",
		loadKey: input.loadKey,
		attempt: input.loadAttempt,
		activeLists,
		hasArchivedLists: archivedLists.length > 0,
	});
	return true;
}

export async function selectActiveFallbackAndDispatch(
	input: HomeCurrentListControllerInput,
	options: Pick<DispatchResolvedOptions, "operation" | "requestId">,
): Promise<boolean> {
	const { session } = input;
	if (!canCommitOperation(input, options.operation, options.requestId)) {
		return false;
	}

	const [activeLists, archivedLists] = await Promise.all([
		session.services.lists.listLists({ archive: "active" }),
		session.services.lists.listLists({ archive: "archived" }),
	]);
	if (!canCommitOperation(input, options.operation, options.requestId)) {
		return false;
	}

	const nextCurrentList = activeLists[0];
	if (!nextCurrentList) {
		await currentListSelectionStore.clearSelection(
			{
				userId: session.user.id,
				householdId: session.activeHousehold.id,
			},
			{
				shouldCommit: () =>
					canCommitOperation(input, options.operation, options.requestId),
			},
		);
		if (!canCommitOperation(input, options.operation, options.requestId)) {
			return false;
		}

		input.dispatch({
			type: "zeroActive",
			loadKey: input.loadKey,
			attempt: input.loadAttempt,
			hasArchivedLists: archivedLists.length > 0,
		});
		return true;
	}

	await currentListSelectionStore.writeSelection(
		{
			userId: session.user.id,
			householdId: session.activeHousehold.id,
			listId: nextCurrentList.id,
		},
		{
			shouldCommit: () =>
				canCommitOperation(input, options.operation, options.requestId),
		},
	);
	if (!canCommitOperation(input, options.operation, options.requestId)) {
		return false;
	}

	const loaded = await loadCurrentListResult(session, nextCurrentList.id);
	if (
		!canCommitOperation(input, options.operation, options.requestId) ||
		loaded.status !== "ready"
	) {
		return false;
	}

	input.dispatch({
		type: "listReady",
		loadKey: input.loadKey,
		attempt: input.loadAttempt,
		activeLists,
		currentList: nextCurrentList,
		hasArchivedLists: archivedLists.length > 0,
		initialList: loaded.initialList,
		isCreating: false,
		isRenaming: false,
		isSwitching: false,
	});
	return true;
}

type ResolvedCurrentList = Awaited<
	ReturnType<typeof resolveAndLoadCurrentList>
>;

function dispatchResolvedResource(
	input: HomeCurrentListControllerInput,
	resolved: ResolvedCurrentList,
	options: Pick<DispatchResolvedOptions, "isRenaming" | "isSwitching">,
) {
	if (resolved.status === "zero-active") {
		input.dispatch({
			type: "zeroActive",
			loadKey: input.loadKey,
			attempt: input.loadAttempt,
			hasArchivedLists: resolved.hasArchivedLists,
		});
		return;
	}

	if (resolved.status === "deleted-current") {
		input.dispatch({
			type: "deletedCurrent",
			loadKey: input.loadKey,
			attempt: input.loadAttempt,
			activeLists: resolved.activeLists,
			hasArchivedLists: resolved.hasArchivedLists,
		});
		return;
	}

	input.dispatch({
		type: "listReady",
		loadKey: input.loadKey,
		attempt: input.loadAttempt,
		activeLists: resolved.activeLists,
		currentList: resolved.currentList,
		hasArchivedLists: resolved.hasArchivedLists,
		initialList: resolved.initialList,
		isCreating: false,
		isRenaming: options.isRenaming,
		isSwitching: options.isSwitching,
	});
}

export function initialListWithCurrentListName(
	resource: ReadyResource,
	currentList: ListSummary,
): ActiveListInitialState {
	if (currentList.id !== resource.currentList.id) {
		return resource.initialList;
	}

	return {
		...resource.initialList,
		listName: currentList.name,
	};
}

export async function resolveAndLoadCurrentList(
	session: AuthenticatedAppSession,
): Promise<
	| { status: "zero-active"; hasArchivedLists: boolean }
	| {
			status: "deleted-current";
			activeLists: ListSummary[];
			hasArchivedLists: boolean;
	  }
	| {
			status: "ready";
			activeLists: ListSummary[];
			currentList: ListSummary;
			hasArchivedLists: boolean;
			initialList: ActiveListInitialState;
	  }
> {
	const resolution = await resolveHomeCurrentList({
		userId: session.user.id,
		householdId: session.activeHousehold.id,
		listService: session.services.lists,
		selectionStore: currentListSelectionStore,
	});

	if (resolution.status === "zero-active") {
		return {
			status: "zero-active",
			hasArchivedLists: resolution.hasArchivedLists,
		};
	}
	if (resolution.status === "deleted-current") {
		return {
			status: "deleted-current",
			activeLists: resolution.activeLists,
			hasArchivedLists: resolution.hasArchivedLists,
		};
	}

	const loaded = await loadCurrentListResult(
		session,
		resolution.currentList.id,
	);
	if (loaded.status === "deleted") {
		return {
			status: "deleted-current",
			activeLists: resolution.activeLists,
			hasArchivedLists: resolution.hasArchivedLists,
		};
	}
	if (loaded.status === "missing") {
		const fallbackList = resolution.activeLists.find(
			(list) => list.id !== resolution.currentList.id,
		);
		if (!fallbackList) {
			return {
				status: "zero-active",
				hasArchivedLists: resolution.hasArchivedLists,
			};
		}
		const fallback = await loadCurrentListResult(session, fallbackList.id);
		if (fallback.status !== "ready") {
			throw new Error("Current List is not available");
		}
		return {
			status: "ready",
			activeLists: resolution.activeLists,
			currentList: fallbackList,
			hasArchivedLists: resolution.hasArchivedLists,
			initialList: fallback.initialList,
		};
	}

	return {
		status: "ready",
		activeLists: resolution.activeLists,
		currentList: resolution.currentList,
		hasArchivedLists: resolution.hasArchivedLists,
		initialList: loaded.initialList,
	};
}

export async function loadCurrentList(
	session: AuthenticatedAppSession,
	listId: string,
): Promise<ActiveListInitialState> {
	const result = await loadCurrentListResult(session, listId);
	if (result.status !== "ready") {
		throw new Error("Current List is not available");
	}
	return result.initialList;
}

export async function loadCurrentListResult(
	session: AuthenticatedAppSession,
	listId: string,
): Promise<LoadedCurrentListResult> {
	const listResult = await session.services.lists.getList({ listId });
	if (listResult.status !== "available") {
		return { status: listResult.status };
	}

	const items = await session.services.items.listItems({ listId });
	const list = listResult.list;
	const memberNames = memberNamesFromSession(session);

	return {
		status: "ready",
		list,
		initialList: {
			householdName: session.activeHousehold.name,
			listName: list.name,
			items: items.map((item) => activeListItemFromItem(item, memberNames)),
		},
	};
}

export function memberNamesFromSession(
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

export function activeListItemFromItem(
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
