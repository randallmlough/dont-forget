import type { CurrentListSelectionStore } from "@/lib/local-storage/current-list-selection";
import type {
	GetListResult,
	ListService,
	ListSummary,
} from "@/lib/services/list";
import { resolveHomeCurrentList } from "./current-list-resolver";

const recentList = listSummary({
	id: "lst_recent",
	name: "Recent",
	updatedAt: 1_700_000_000_200,
});
const olderList = listSummary({
	id: "lst_older",
	name: "Older",
	updatedAt: 1_700_000_000_100,
});

describe("resolveHomeCurrentList", () => {
	it("falls back to the most recently active List when no selection exists", async () => {
		await expect(resolveWith({ selectedListId: null })).resolves.toMatchObject({
			status: "active",
			currentList: { id: recentList.id },
		});
	});

	it("uses a stored selection when it points to an active List", async () => {
		await expect(
			resolveWith({ selectedListId: olderList.id }),
		).resolves.toMatchObject({
			status: "active",
			currentList: { id: olderList.id },
		});
	});

	it("falls back to the most recently active List for missing or invalid selections", async () => {
		await expect(
			resolveWith({ selectedListId: "lst_missing" }),
		).resolves.toMatchObject({
			status: "active",
			currentList: { id: recentList.id },
		});
	});

	it("returns deleted-current state when the stored selection was deleted", async () => {
		await expect(
			resolveWith({ selectedListId: "lst_deleted" }),
		).resolves.toMatchObject({
			status: "deleted-current",
			activeLists: [recentList, olderList],
			hasArchivedLists: false,
			deletedListId: "lst_deleted",
		});
	});

	it("keeps a stored archived Current List when active Lists are available to switch to", async () => {
		const archivedList = listSummary({
			id: "lst_archived",
			name: "Archived",
			archived: true,
			archivedAt: 1_700_000_000_300,
		});

		await expect(
			resolveWith({
				archivedLists: [archivedList],
				selectedListId: archivedList.id,
			}),
		).resolves.toMatchObject({
			status: "active",
			currentList: { id: archivedList.id, archived: true },
			activeLists: [recentList, olderList],
			hasArchivedLists: true,
		});
	});

	it("keeps a stored archived Current List when no active Lists are available", async () => {
		const archivedList = listSummary({
			id: "lst_archived",
			name: "Archived",
			archived: true,
			archivedAt: 1_700_000_000_300,
		});

		await expect(
			resolveWith({
				activeLists: [],
				archivedLists: [archivedList],
				selectedListId: archivedList.id,
			}),
		).resolves.toMatchObject({
			status: "active",
			currentList: { id: archivedList.id, archived: true },
			activeLists: [],
			hasArchivedLists: true,
		});
	});

	it("returns zero-active state when the Household has no active Lists and no archived Current List", async () => {
		await expect(
			resolveWith({
				activeLists: [],
				archivedLists: [olderList],
				selectedListId: "lst_missing",
			}),
		).resolves.toEqual({
			status: "zero-active",
			activeLists: [],
			hasArchivedLists: true,
		});
	});
});

function resolveWith({
	activeLists = [recentList, olderList],
	archivedLists = [],
	selectedListId,
}: {
	activeLists?: ListSummary[];
	archivedLists?: ListSummary[];
	selectedListId: string | null;
}) {
	const listService: Pick<ListService, "getList" | "listLists"> = {
		getList: jest.fn(
			async ({ listId }): Promise<GetListResult> =>
				listId === "lst_deleted"
					? {
							status: "deleted",
							listId,
							deletedAt: 1_700_000_000_500,
							updatedAt: 1_700_000_000_400,
						}
					: { status: "missing", listId },
		),
		listLists: jest.fn(async (input) =>
			input?.archive === "archived" ? archivedLists : activeLists,
		),
	};
	const selectionStore: Pick<CurrentListSelectionStore, "readSelection"> = {
		readSelection: jest.fn(async () => selectedListId),
	};

	return resolveHomeCurrentList({
		userId: "usr_avery",
		householdId: "hh_avery",
		listService,
		selectionStore,
	});
}

function listSummary(overrides: Partial<ListSummary>): ListSummary {
	return {
		id: "lst_groceries",
		householdId: "hh_avery",
		name: "Groceries",
		createdByUserId: "usr_avery",
		createdAt: 1_700_000_000_000,
		updatedAt: 1_700_000_000_000,
		archived: false,
		archivedAt: null,
		lastActivityAt: 1_700_000_000_000,
		uncheckedItemCount: 0,
		checkedItemCount: 0,
		...overrides,
	};
}
