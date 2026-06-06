import type {
	ActiveListInitialState,
	ActiveListItem,
	AddActiveListItemInput,
} from "@/components/active-list";
import { track } from "@/lib/analytics";
import { currentListSelectionStore } from "@/lib/local-storage/current-list-selection";
import type { ListListsInput, ListSummary } from "@/lib/services/list";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import {
	activeListItemFromItem,
	dispatchDeletedCurrent,
	dispatchResolvedCurrentList,
	type HomeCurrentListControllerInput,
	isActive,
	loadCurrentList,
	loadCurrentListResult,
	memberNamesFromSession,
	type ReadyResource,
	runHomeCurrentListOperation,
	selectActiveFallbackAndDispatch,
} from "./home-current-list-lifecycle";
import type {
	HomeArchiveListResult,
	HomeCreateListResult,
	HomeCurrentListActions,
	HomeCurrentListResource,
	HomeDeleteListResult,
	HomeRenameListResult,
	HomeUnarchiveListResult,
} from "./use-home-current-list";

type SelectableResource = Extract<
	HomeCurrentListResource,
	{ status: "ready" | "deleted-current" }
>;
type CreatableResource = Extract<
	HomeCurrentListResource,
	{ status: "ready" | "zero-active" | "deleted-current" }
>;

export function createHomeCurrentListController(
	input: HomeCurrentListControllerInput,
): HomeCurrentListActions {
	const currentListId =
		input.resource.loadKey === input.loadKey &&
		input.resource.status === "ready"
			? input.resource.currentList.id
			: null;

	return {
		addItem: (itemInput) => addItem(input, currentListId, itemInput),
		archiveList: (listId) => archiveList(input, listId),
		createList: (name) => createList(input, name),
		deleteList: (listId) => deleteList(input, listId),
		loadList: () => loadList(input, currentListId),
		loadListSummaries: (summaryInput) =>
			loadListSummaries(input.session, summaryInput),
		renameList: (listId, name) => renameList(input, listId, name),
		selectList: (listId) => selectList(input, listId),
		setItemChecked: (itemId, checked) =>
			setItemChecked(input, currentListId, itemId, checked),
		unarchiveList: (listId) => unarchiveList(input, listId),
	};
}

async function loadList(
	input: HomeCurrentListControllerInput,
	currentListId: string | null,
): Promise<ActiveListInitialState> {
	if (!currentListId) {
		throw new Error("Current List is not loaded");
	}
	const result = await loadCurrentListResult(input.session, currentListId);
	if (result.status === "ready") {
		if (input.resource.status === "ready") {
			await refreshReadyCurrentListAfterReload(input, result);
		}
		return result.initialList;
	}

	if (result.status === "deleted") {
		await dispatchDeletedCurrent(input, {
			operation: null,
			requestId: null,
		});
	} else {
		await dispatchResolvedCurrentList(input, {
			isRenaming: false,
			isSwitching: false,
			operation: null,
			requestId: null,
		});
	}
	throw new Error("Current List is not available");
}

async function refreshReadyCurrentListAfterReload(
	input: HomeCurrentListControllerInput,
	result: Extract<
		Awaited<ReturnType<typeof loadCurrentListResult>>,
		{ status: "ready" }
	>,
): Promise<void> {
	const { dispatch, loadAttempt, loadKey, resource, session } = input;
	if (
		resource.loadKey !== loadKey ||
		resource.status !== "ready" ||
		result.list.id !== resource.currentList.id
	) {
		return;
	}

	const [activeLists, archivedLists] = await Promise.all([
		session.services.lists.listLists({ archive: "active" }),
		session.services.lists.listLists({ archive: "archived" }),
	]);
	const currentList = (result.list.archived ? archivedLists : activeLists).find(
		(list) => list.id === result.list.id,
	);
	if (!currentList) return;

	dispatch({
		type: "listReady",
		loadKey,
		attempt: loadAttempt,
		activeLists,
		currentList,
		hasArchivedLists: archivedLists.length > 0,
		initialList: result.initialList,
		isCreating: false,
		isRenaming: resource.isRenaming,
		isSwitching: resource.isSwitching,
	});
}

async function loadListSummaries(
	session: AuthenticatedAppSession,
	input: ListListsInput,
): Promise<ListSummary[]> {
	return session.services.lists.listLists(input);
}

async function addItem(
	input: HomeCurrentListControllerInput,
	currentListId: string | null,
	itemInput: AddActiveListItemInput,
): Promise<ActiveListItem> {
	if (!currentListId) {
		throw new Error("Current List is not loaded");
	}
	const item = await input.session.services.items.addItem({
		listId: currentListId,
		userId: input.session.activeMember.userId,
		name: itemInput.name,
		quantity: itemInput.quantity,
		notes: itemInput.notes,
	});
	return activeListItemFromItem(item, memberNamesFromSession(input.session));
}

async function setItemChecked(
	input: HomeCurrentListControllerInput,
	currentListId: string | null,
	itemId: string,
	checked: boolean,
) {
	if (!currentListId) {
		throw new Error("Current List is not loaded");
	}
	await input.session.services.items.setItemChecked({
		listId: currentListId,
		itemId,
		userId: input.session.activeMember.userId,
		checked,
	});
}

async function selectList(
	input: HomeCurrentListControllerInput,
	listId: string,
): Promise<boolean> {
	return runHomeCurrentListOperation<boolean>(input, {
		operation: "switch",
		allowedStatuses: ["ready", "deleted-current"],
		failedResult: false,
		startAction: "switchStarted",
		finishAction: "switchFinished",
		run: async (operation) => {
			const { dispatch, loadAttempt, loadKey, session } = input;
			const resource = input.resource as SelectableResource;
			if (resource.status === "ready" && listId === resource.currentList.id) {
				return false;
			}

			const nextList = resource.activeLists.find((list) => list.id === listId);
			if (!nextList) return false;
			const initialList = await loadCurrentList(session, listId);
			if (!operation.isActive()) return false;

			await currentListSelectionStore.writeSelection(
				{
					userId: session.user.id,
					householdId: session.activeHousehold.id,
					listId,
				},
				{
					shouldCommit: operation.isActive,
				},
			);
			if (!operation.isActive()) return false;

			dispatch({
				type: "listReady",
				loadKey,
				attempt: loadAttempt,
				activeLists: resource.activeLists,
				currentList: nextList,
				hasArchivedLists: resource.hasArchivedLists,
				initialList,
				isCreating: false,
				isRenaming: false,
				isSwitching: false,
			});
			track("list_switched", {
				household_id: session.activeHousehold.id,
				list_id: listId,
				user_id: session.user.id,
			});
			return true;
		},
	});
}

async function archiveList(
	input: HomeCurrentListControllerInput,
	listId: string,
): Promise<HomeArchiveListResult> {
	return runHomeCurrentListOperation<HomeArchiveListResult>(input, {
		operation: "archive",
		allowedStatuses: ["ready"],
		failedResult: { status: "failed" },
		run: async (operation) => {
			const { session } = input;
			const resource = input.resource as ReadyResource;
			const result = await session.services.lists.archiveList({ listId });
			if (result.status === "missing" || result.status === "deleted") {
				if (listId === resource.currentList.id) {
					if (result.status === "deleted") {
						await dispatchDeletedCurrent(input, {
							operation: "archive",
							requestId: operation.requestId,
						});
					} else {
						await recoverCurrentListAfterStaleArchive(
							input,
							operation.requestId,
						);
					}
				} else {
					await refreshListsAfterArchive(input, operation.requestId);
				}
				return result;
			}

			if (result.status === "archived") {
				operation.requestSync();
			}

			if (listId === resource.currentList.id) {
				if (
					!(await recoverCurrentListAfterArchive(input, operation.requestId))
				) {
					return { status: "failed" };
				}
			} else if (
				!(await refreshListsAfterArchive(input, operation.requestId))
			) {
				return { status: "failed" };
			}

			return { status: result.status };
		},
	});
}

async function deleteList(
	input: HomeCurrentListControllerInput,
	listId: string,
): Promise<HomeDeleteListResult> {
	return runHomeCurrentListOperation<HomeDeleteListResult>(input, {
		operation: "delete",
		allowedStatuses: ["ready", "deleted-current"],
		failedResult: { status: "failed" },
		run: async (operation) => {
			const { session } = input;
			const resource = input.resource as SelectableResource;
			const result = await session.services.lists.deleteList({ listId });
			if (result.status === "missing") {
				await refreshListsAfterDelete(input, operation.requestId);
				return result;
			}
			if (result.status === "already-deleted") {
				if (resource.status === "ready" && listId === resource.currentList.id) {
					await dispatchDeletedCurrent(input, {
						operation: "delete",
						requestId: operation.requestId,
					});
				} else {
					await refreshListsAfterDelete(input, operation.requestId);
				}
				return result;
			}

			if (result.status === "deleted") {
				operation.requestSync();
			}

			if (resource.status === "ready" && listId === resource.currentList.id) {
				if (
					!(await recoverCurrentListAfterDelete(input, operation.requestId))
				) {
					return { status: "failed" };
				}
			} else if (!(await refreshListsAfterDelete(input, operation.requestId))) {
				return { status: "failed" };
			}

			return { status: result.status };
		},
	});
}

async function unarchiveList(
	input: HomeCurrentListControllerInput,
	listId: string,
): Promise<HomeUnarchiveListResult> {
	return runHomeCurrentListOperation<HomeUnarchiveListResult>(input, {
		operation: "unarchive",
		allowedStatuses: ["ready", "zero-active", "deleted-current"],
		failedResult: { status: "failed" },
		run: async (operation) => {
			const result = await input.session.services.lists.unarchiveList({
				listId,
			});
			if (result.status === "missing" || result.status === "deleted") {
				await refreshListsAfterUnarchive(input, operation.requestId);
				return result;
			}

			if (result.status === "unarchived") {
				operation.requestSync();
			}

			if (!(await selectUnarchivedList(input, operation.requestId, listId))) {
				return { status: "failed" };
			}
			return { status: result.status };
		},
	});
}

async function createList(
	input: HomeCurrentListControllerInput,
	name: string,
): Promise<HomeCreateListResult> {
	return runHomeCurrentListOperation<HomeCreateListResult>(input, {
		operation: "create",
		allowedStatuses: ["ready", "zero-active", "deleted-current"],
		failedResult: { status: "failed" },
		startAction: "createStarted",
		finishAction: "createFinished",
		run: async (operation) => {
			const { dispatch, loadAttempt, loadKey, session } = input;
			const resource = input.resource as CreatableResource;
			const result = await session.services.lists.createList({ name });
			if (result.status === "invalid") {
				return result;
			}

			operation.requestSync();
			if (!operation.isActive()) return { status: "failed" };

			await currentListSelectionStore
				.writeSelection(
					{
						userId: session.user.id,
						householdId: session.activeHousehold.id,
						listId: result.list.id,
					},
					{
						shouldCommit: operation.isActive,
					},
				)
				.catch(() => undefined);
			if (!operation.isActive()) return { status: "failed" };

			const nextActiveLists = await session.services.lists.listLists({
				archive: "active",
			});
			if (!operation.isActive()) return { status: "failed" };
			const createdListSummary = nextActiveLists.find(
				(list) => list.id === result.list.id,
			);
			if (!createdListSummary) {
				return { status: "failed" };
			}
			dispatch({
				type: "listReady",
				loadKey,
				attempt: loadAttempt,
				activeLists: nextActiveLists,
				currentList: createdListSummary,
				hasArchivedLists:
					resource.status === "ready" || resource.status === "deleted-current"
						? resource.hasArchivedLists
						: false,
				initialList: {
					householdName: session.activeHousehold.name,
					listName: createdListSummary.name,
					items: [],
				},
				isCreating: false,
				isRenaming: false,
				isSwitching: false,
			});
			return { status: "created" };
		},
	});
}

async function renameList(
	input: HomeCurrentListControllerInput,
	listId: string,
	name: string,
): Promise<HomeRenameListResult> {
	return runHomeCurrentListOperation<HomeRenameListResult>(input, {
		operation: "rename",
		allowedStatuses: ["ready"],
		failedResult: { status: "failed" },
		startAction: "renameStarted",
		finishAction: "renameFinished",
		run: async (operation) => {
			const { session } = input;
			const resource = input.resource as ReadyResource;
			const result = await session.services.lists.renameList({ listId, name });
			if (result.status === "invalid") {
				return result;
			}

			if (result.status === "missing" || result.status === "deleted") {
				if (listId === resource.currentList.id) {
					await recoverCurrentListAfterStaleRename(input, operation.requestId);
				} else {
					await refreshActiveListsAfterRename(input, operation.requestId);
				}
				return result;
			}

			if (result.status === "unchanged") {
				if (
					!(await refreshActiveListsAfterRename(input, operation.requestId))
				) {
					return { status: "failed" };
				}
				return { status: "unchanged" };
			}

			operation.requestSync();
			if (!(await refreshActiveListsAfterRename(input, operation.requestId))) {
				return { status: "failed" };
			}

			return { status: "renamed" };
		},
	});
}

async function refreshActiveListsAfterRename(
	input: HomeCurrentListControllerInput,
	requestId: number,
): Promise<boolean> {
	if (
		!isActive(input, "rename", requestId) ||
		input.resource.loadKey !== input.loadKey ||
		input.resource.status !== "ready"
	) {
		return false;
	}

	return refreshReadyResourceAfterSummaryChange(input, {
		isRenaming: true,
		isSwitching: false,
		operation: "rename",
		requestId,
	});
}

async function recoverCurrentListAfterStaleRename(
	input: HomeCurrentListControllerInput,
	requestId: number,
): Promise<boolean> {
	return dispatchResolvedCurrentList(input, {
		isRenaming: true,
		isSwitching: false,
		operation: "rename",
		requestId,
	});
}

async function refreshReadyResourceAfterSummaryChange(
	input: HomeCurrentListControllerInput,
	options: {
		operation: "archive" | "delete" | "rename" | "unarchive";
		requestId: number;
		isRenaming: boolean;
		isSwitching: boolean;
	},
): Promise<boolean> {
	const { dispatch, loadAttempt, loadKey, resource, session } = input;
	if (
		!isActive(input, options.operation, options.requestId) ||
		resource.loadKey !== loadKey ||
		resource.status !== "ready"
	) {
		return false;
	}

	const [activeLists, archivedLists] = await Promise.all([
		session.services.lists.listLists({ archive: "active" }),
		session.services.lists.listLists({ archive: "archived" }),
	]);
	if (!isActive(input, options.operation, options.requestId)) return false;

	const currentList = [...activeLists, ...archivedLists].find(
		(list) => list.id === resource.currentList.id,
	);
	if (!currentList) {
		const currentLifecycle = await loadCurrentListResult(
			session,
			resource.currentList.id,
		);
		if (!isActive(input, options.operation, options.requestId)) return false;
		if (currentLifecycle.status === "deleted") {
			return dispatchDeletedCurrent(input, {
				operation: options.operation,
				requestId: options.requestId,
			});
		}
		return dispatchResolvedCurrentList(input, {
			isRenaming: options.isRenaming,
			isSwitching: options.isSwitching,
			operation: options.operation,
			requestId: options.requestId,
		});
	}

	const loadedCurrentList = await loadCurrentListResult(
		session,
		currentList.id,
	);
	if (!isActive(input, options.operation, options.requestId)) return false;
	if (loadedCurrentList.status === "deleted") {
		return dispatchDeletedCurrent(input, {
			operation: options.operation,
			requestId: options.requestId,
		});
	}
	if (loadedCurrentList.status === "missing") {
		return dispatchResolvedCurrentList(input, {
			isRenaming: options.isRenaming,
			isSwitching: options.isSwitching,
			operation: options.operation,
			requestId: options.requestId,
		});
	}

	dispatch({
		type: "listReady",
		loadKey,
		attempt: loadAttempt,
		activeLists,
		currentList,
		hasArchivedLists: archivedLists.length > 0,
		initialList: loadedCurrentList.initialList,
		isCreating: false,
		isRenaming: options.isRenaming,
		isSwitching: options.isSwitching,
	});
	return true;
}

async function refreshListsAfterArchive(
	input: HomeCurrentListControllerInput,
	requestId: number,
): Promise<boolean> {
	if (
		!isActive(input, "archive", requestId) ||
		input.resource.loadKey !== input.loadKey ||
		input.resource.status !== "ready"
	) {
		return false;
	}

	return refreshReadyResourceAfterSummaryChange(input, {
		isRenaming: false,
		isSwitching: false,
		operation: "archive",
		requestId,
	});
}

async function recoverCurrentListAfterArchive(
	input: HomeCurrentListControllerInput,
	requestId: number,
): Promise<boolean> {
	return selectActiveFallbackAndDispatch(input, {
		operation: "archive",
		requestId,
	});
}

async function recoverCurrentListAfterStaleArchive(
	input: HomeCurrentListControllerInput,
	requestId: number,
): Promise<boolean> {
	return dispatchResolvedCurrentList(input, {
		isRenaming: false,
		isSwitching: false,
		operation: "archive",
		requestId,
	});
}

async function refreshListsAfterDelete(
	input: HomeCurrentListControllerInput,
	requestId: number,
): Promise<boolean> {
	if (
		!isActive(input, "delete", requestId) ||
		input.resource.loadKey !== input.loadKey ||
		(input.resource.status !== "ready" &&
			input.resource.status !== "deleted-current")
	) {
		return false;
	}

	if (input.resource.status === "deleted-current") {
		const [activeLists, archivedLists] = await Promise.all([
			input.session.services.lists.listLists({ archive: "active" }),
			input.session.services.lists.listLists({ archive: "archived" }),
		]);
		if (!isActive(input, "delete", requestId)) return false;
		input.dispatch({
			type: "deletedCurrent",
			loadKey: input.loadKey,
			attempt: input.loadAttempt,
			activeLists,
			hasArchivedLists: archivedLists.length > 0,
		});
		return true;
	}

	return refreshReadyResourceAfterSummaryChange(input, {
		isRenaming: false,
		isSwitching: false,
		operation: "delete",
		requestId,
	});
}

async function recoverCurrentListAfterDelete(
	input: HomeCurrentListControllerInput,
	requestId: number,
): Promise<boolean> {
	return selectActiveFallbackAndDispatch(input, {
		operation: "delete",
		requestId,
	});
}

async function refreshListsAfterUnarchive(
	input: HomeCurrentListControllerInput,
	requestId: number,
): Promise<boolean> {
	if (
		!isActive(input, "unarchive", requestId) ||
		input.resource.loadKey !== input.loadKey ||
		(input.resource.status !== "ready" &&
			input.resource.status !== "zero-active" &&
			input.resource.status !== "deleted-current")
	) {
		return false;
	}

	if (input.resource.status === "zero-active") {
		const archivedLists = await input.session.services.lists.listLists({
			archive: "archived",
		});
		if (!isActive(input, "unarchive", requestId)) return false;
		input.dispatch({
			type: "zeroActive",
			loadKey: input.loadKey,
			attempt: input.loadAttempt,
			hasArchivedLists: archivedLists.length > 0,
		});
		return true;
	}

	if (input.resource.status === "deleted-current") {
		const [activeLists, archivedLists] = await Promise.all([
			input.session.services.lists.listLists({ archive: "active" }),
			input.session.services.lists.listLists({ archive: "archived" }),
		]);
		if (!isActive(input, "unarchive", requestId)) return false;
		input.dispatch({
			type: "deletedCurrent",
			loadKey: input.loadKey,
			attempt: input.loadAttempt,
			activeLists,
			hasArchivedLists: archivedLists.length > 0,
		});
		return true;
	}

	return refreshReadyResourceAfterSummaryChange(input, {
		isRenaming: false,
		isSwitching: false,
		operation: "unarchive",
		requestId,
	});
}

async function selectUnarchivedList(
	input: HomeCurrentListControllerInput,
	requestId: number,
	listId: string,
): Promise<boolean> {
	const { session } = input;
	if (!isActive(input, "unarchive", requestId)) return false;
	await currentListSelectionStore.writeSelection(
		{
			userId: session.user.id,
			householdId: session.activeHousehold.id,
			listId,
		},
		{
			shouldCommit: () => isActive(input, "unarchive", requestId),
		},
	);
	if (!isActive(input, "unarchive", requestId)) return false;

	return dispatchResolvedCurrentList(input, {
		isRenaming: false,
		isSwitching: false,
		operation: "unarchive",
		requestId,
	});
}
