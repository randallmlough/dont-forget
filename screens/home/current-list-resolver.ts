import type {
	CurrentListSelectionScope,
	CurrentListSelectionStore,
} from "@/lib/local-storage/current-list-selection";
import type { ListService, ListSummary } from "@/lib/services/list";

export type HomeCurrentListResolution =
	| {
			status: "active";
			currentList: ListSummary;
			activeLists: ListSummary[];
			hasArchivedLists: boolean;
	  }
	| {
			status: "zero-active";
			activeLists: [];
			hasArchivedLists: boolean;
	  }
	| {
			status: "deleted-current";
			activeLists: ListSummary[];
			hasArchivedLists: boolean;
			deletedListId: string;
	  };

export type ResolveHomeCurrentListInput = CurrentListSelectionScope & {
	listService: Pick<ListService, "getList" | "listLists">;
	selectionStore: Pick<CurrentListSelectionStore, "readSelection">;
};

export async function resolveHomeCurrentList(
	input: ResolveHomeCurrentListInput,
): Promise<HomeCurrentListResolution> {
	const [activeLists, archivedLists, selectedListId] = await Promise.all([
		input.listService.listLists({ archive: "active" }),
		input.listService.listLists({ archive: "archived" }),
		input.selectionStore.readSelection({
			userId: input.userId,
			householdId: input.householdId,
		}),
	]);
	const hasArchivedLists = archivedLists.length > 0;

	const selectedList = selectedListId
		? activeLists.find((list) => list.id === selectedListId)
		: undefined;
	const archivedSelectedList =
		selectedListId && !selectedList
			? archivedLists.find((list) => list.id === selectedListId)
			: undefined;
	const selectedLifecycle =
		selectedListId && !selectedList && !archivedSelectedList
			? await input.listService.getList({ listId: selectedListId })
			: null;

	if (selectedLifecycle?.status === "deleted") {
		return {
			status: "deleted-current",
			activeLists,
			hasArchivedLists,
			deletedListId: selectedLifecycle.listId,
		};
	}

	if (activeLists.length === 0 && !archivedSelectedList) {
		return { status: "zero-active", activeLists: [], hasArchivedLists };
	}

	return {
		status: "active",
		currentList: selectedList ?? archivedSelectedList ?? activeLists[0],
		activeLists,
		hasArchivedLists,
	};
}
