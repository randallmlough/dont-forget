import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import type { ComponentProps } from "react";
import type { ListSummary } from "@/lib/services/list";
import { deferred } from "@/lib/test/async";
import { ListSwitcher } from "./list-switcher";

jest.mock("@/lib/analytics", () =>
	jest.requireActual("@/lib/test/mocks/analytics"),
);

jest.mock("@/lib/logger", () =>
	jest
		.requireActual<typeof import("@/lib/test/mocks/logger")>(
			"@/lib/test/mocks/logger",
		)
		.createMockLoggerModule(),
);

describe("ListSwitcher", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date(2026, 5, 5, 12).getTime());
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("renders summary counts and activity labels", async () => {
		renderSwitcher({
			activeLists: [
				listSummary({
					id: "lst_groceries",
					name: "Groceries",
					lastActivityAt: new Date(2026, 5, 5, 9).getTime(),
					uncheckedItemCount: 2,
					checkedItemCount: 1,
				}),
			],
			onLoadLists: jest.fn(async () => [
				listSummary({
					id: "lst_groceries",
					name: "Groceries",
					lastActivityAt: new Date(2026, 5, 5, 9).getTime(),
					uncheckedItemCount: 2,
					checkedItemCount: 1,
				}),
			]),
		});

		await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
		expect(
			screen.getByRole("button", {
				name: "Groceries, current List, 2 unchecked, 1 checked, Updated today",
			}),
		).toBeTruthy();
		expect(screen.getByText("2 unchecked · 1 checked")).toBeTruthy();
		expect(screen.getByText("Updated today")).toBeTruthy();
	});

	it("labels non-current active rows with counts and activity", async () => {
		const lists = [
			listSummary({
				id: "lst_groceries",
				name: "Groceries",
				lastActivityAt: new Date(2026, 5, 5, 9).getTime(),
				uncheckedItemCount: 1,
				checkedItemCount: 0,
			}),
			listSummary({
				id: "lst_costco",
				name: "Costco",
				lastActivityAt: new Date(2026, 5, 4, 9).getTime(),
				uncheckedItemCount: 5,
				checkedItemCount: 2,
			}),
		];
		renderSwitcher({
			activeLists: lists,
			onLoadLists: jest.fn(async () => lists),
		});

		await waitFor(() => expect(screen.getByText("Costco")).toBeTruthy());
		expect(
			screen.getByRole("button", {
				name: "Costco, 5 unchecked, 2 checked, Updated yesterday",
			}),
		).toBeTruthy();
	});

	it("debounces search before querying and preserves text across segments", async () => {
		const onLoadLists = jest.fn(async ({ archive, searchText }) =>
			archive === "archived" && searchText === "camp"
				? [listSummary({ id: "lst_archived", name: "Archived Camping" })]
				: [],
		);
		renderSwitcher({ activeLists: [], onLoadLists });
		await waitFor(() =>
			expect(onLoadLists).toHaveBeenLastCalledWith({
				archive: "active",
				searchText: "",
			}),
		);
		onLoadLists.mockClear();

		fireEvent.changeText(screen.getByLabelText("Search Lists"), "camp");
		act(() => {
			jest.advanceTimersByTime(299);
		});
		expect(onLoadLists).not.toHaveBeenCalled();

		await act(async () => {
			jest.advanceTimersByTime(1);
		});
		await waitFor(() =>
			expect(onLoadLists).toHaveBeenLastCalledWith({
				archive: "active",
				searchText: "camp",
			}),
		);

		fireEvent.press(screen.getByRole("button", { name: "Archived" }));
		await waitFor(() =>
			expect(onLoadLists).toHaveBeenLastCalledWith({
				archive: "archived",
				searchText: "camp",
			}),
		);
		expect(screen.getByLabelText("Search Lists").props.value).toBe("camp");
		expect(screen.getByText("Archived Camping")).toBeTruthy();
	});

	it("clears search text and renders segment-scoped empty states", async () => {
		const onLoadLists = jest.fn(async () => []);
		renderSwitcher({ activeLists: [], hasArchivedLists: true, onLoadLists });
		await waitFor(() =>
			expect(screen.getByText("No active Lists")).toBeTruthy(),
		);
		expect(screen.getByText("View Archived")).toBeTruthy();

		fireEvent.changeText(screen.getByLabelText("Search Lists"), "zzz");
		await act(async () => {
			jest.advanceTimersByTime(300);
		});
		await waitFor(() =>
			expect(screen.getByText("No matching Lists")).toBeTruthy(),
		);

		fireEvent.press(screen.getByRole("button", { name: "Clear" }));
		await act(async () => {
			jest.advanceTimersByTime(300);
		});
		await waitFor(() =>
			expect(screen.getByText("No active Lists")).toBeTruthy(),
		);

		fireEvent.press(screen.getByRole("button", { name: "Archived" }));
		await waitFor(() =>
			expect(screen.getByText("No archived Lists")).toBeTruthy(),
		);

		fireEvent.changeText(screen.getByLabelText("Search Lists"), "zzz");
		await act(async () => {
			jest.advanceTimersByTime(300);
		});
		await waitFor(() =>
			expect(screen.getByText("No matching archived Lists")).toBeTruthy(),
		);
	});

	it("renders load errors with retry", async () => {
		let archivedLoadCount = 0;
		const onLoadLists = jest.fn(async ({ archive }) => {
			if (archive === "active") return [];
			archivedLoadCount += 1;
			if (archivedLoadCount === 1) throw new Error("offline");
			return [listSummary({ name: "Recovered" })];
		});
		renderSwitcher({ activeLists: [], onLoadLists });

		fireEvent.press(screen.getByRole("button", { name: "Archived" }));
		await waitFor(() =>
			expect(screen.getByText("Lists could not be loaded.")).toBeTruthy(),
		);
		await act(async () => {
			fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
		});

		await waitFor(() => expect(screen.getByText("Recovered")).toBeTruthy());
	});

	it("ignores stale async loads after a newer segment query commits", async () => {
		const activeSearch = deferred<ListSummary[]>();
		const onLoadLists = jest.fn(async ({ archive, searchText }) => {
			if (archive === "active" && searchText) {
				return activeSearch.promise;
			}
			if (archive === "active") return [];
			return [listSummary({ id: "lst_archived", name: "Archived Camping" })];
		});
		renderSwitcher({ activeLists: [], onLoadLists });

		fireEvent.changeText(screen.getByLabelText("Search Lists"), "camp");
		await act(async () => {
			jest.advanceTimersByTime(300);
		});
		await waitFor(() =>
			expect(onLoadLists).toHaveBeenLastCalledWith({
				archive: "active",
				searchText: "camp",
			}),
		);

		fireEvent.press(screen.getByRole("button", { name: "Archived" }));
		await waitFor(() =>
			expect(screen.getByText("Archived Camping")).toBeTruthy(),
		);

		await act(async () => {
			activeSearch.resolve([
				listSummary({ id: "lst_active", name: "Active Camping" }),
			]);
			await activeSearch.promise;
		});

		expect(screen.getByText("Archived Camping")).toBeTruthy();
		expect(screen.queryByText("Active Camping")).toBeNull();
	});

	it("does not select archived rows", async () => {
		const onSelectList = jest.fn();
		renderSwitcher({
			activeLists: [],
			onSelectList,
			onLoadLists: jest.fn(async ({ archive }) =>
				archive === "archived"
					? [listSummary({ id: "lst_archived", name: "Archived Camping" })]
					: [],
			),
		});

		fireEvent.press(screen.getByRole("button", { name: "Archived" }));
		await waitFor(() =>
			expect(
				screen.getByRole("button", {
					name: "Archived Camping, archived List, 0 unchecked, 0 checked, Updated Nov 14, 2023",
				}),
			).toBeTruthy(),
		);
		fireEvent.press(
			screen.getByRole("button", {
				name: "Archived Camping, archived List, 0 unchecked, 0 checked, Updated Nov 14, 2023",
			}),
		);

		expect(onSelectList).not.toHaveBeenCalled();
	});

	it("confirms before archiving an active row", async () => {
		const onArchiveList = jest.fn(async () => ({
			status: "archived" as const,
		}));
		renderSwitcher({
			activeLists: [listSummary({ id: "lst_groceries", name: "Groceries" })],
			onArchiveList,
			onLoadLists: jest.fn(async () => [
				listSummary({ id: "lst_groceries", name: "Groceries" }),
			]),
		});
		await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());

		fireEvent.press(
			screen.getByRole("button", { name: "List actions for Groceries" }),
		);
		fireEvent.press(screen.getByRole("button", { name: "Archive" }));

		expect(screen.getByText("Archive this List?")).toBeTruthy();
		expect(
			screen.getByText(
				"Groceries will move to Archived Lists. You can restore it later.",
			),
		).toBeTruthy();
		await act(async () => {
			fireEvent.press(screen.getByRole("button", { name: "Archive" }));
		});

		expect(onArchiveList).toHaveBeenCalledWith("lst_groceries");
	});

	it("ignores duplicate archive confirmation submits", async () => {
		const archiveGate = deferred<void>();
		const onArchiveList = jest.fn(async () => {
			await archiveGate.promise;
			return { status: "archived" as const };
		});
		renderSwitcher({
			activeLists: [listSummary({ id: "lst_groceries", name: "Groceries" })],
			onArchiveList,
			onLoadLists: jest.fn(async () => [
				listSummary({ id: "lst_groceries", name: "Groceries" }),
			]),
		});
		await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());

		fireEvent.press(
			screen.getByRole("button", { name: "List actions for Groceries" }),
		);
		fireEvent.press(screen.getByRole("button", { name: "Archive" }));
		fireEvent.press(screen.getByRole("button", { name: "Archive" }));
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "Archiving" }).props
					.accessibilityState,
			).toEqual({ disabled: true }),
		);
		fireEvent.press(screen.getByRole("button", { name: "Archiving" }));

		expect(onArchiveList).toHaveBeenCalledTimes(1);
		await act(async () => {
			archiveGate.resolve();
			await archiveGate.promise;
		});
	});

	it("keeps archive confirmation open with stale target copy", async () => {
		const onLoadLists = jest.fn(async () => [
			listSummary({ id: "lst_groceries", name: "Groceries" }),
		]);
		renderSwitcher({
			activeLists: [listSummary({ id: "lst_groceries", name: "Groceries" })],
			onArchiveList: jest.fn(async () => ({
				status: "deleted" as const,
				listId: "lst_groceries",
				deletedAt: 1_700_000_000_100,
				updatedAt: 1_700_000_000_100,
			})),
			onLoadLists,
		});
		await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());

		fireEvent.press(
			screen.getByRole("button", { name: "List actions for Groceries" }),
		);
		fireEvent.press(screen.getByRole("button", { name: "Archive" }));
		await act(async () => {
			fireEvent.press(screen.getByRole("button", { name: "Archive" }));
		});

		expect(screen.getByText("List was deleted.")).toBeTruthy();
		expect(screen.getByText("Archive this List?")).toBeTruthy();
		expect(onLoadLists).toHaveBeenLastCalledWith({
			archive: "active",
			searchText: "",
		});
	});

	it("confirms before deleting an active row", async () => {
		const onDeleteList = jest.fn(async () => ({
			status: "deleted" as const,
		}));
		renderSwitcher({
			activeLists: [listSummary({ id: "lst_groceries", name: "Groceries" })],
			onDeleteList,
			onLoadLists: jest.fn(async () => [
				listSummary({ id: "lst_groceries", name: "Groceries" }),
			]),
		});
		await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());

		fireEvent.press(
			screen.getByRole("button", { name: "List actions for Groceries" }),
		);
		const deleteAction = screen.getByRole("button", { name: "Delete" });
		expect(deleteAction.props.accessibilityHint).toBe("Deletes Groceries");
		fireEvent.press(deleteAction);

		expect(screen.getByText("Delete this List?")).toBeTruthy();
		expect(
			screen.getByText(
				"Groceries will be removed from the app. This cannot be undone.",
			),
		).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Delete" }).props.accessibilityHint,
		).toBe("Permanently removes Groceries");
		await act(async () => {
			fireEvent.press(screen.getByRole("button", { name: "Delete" }));
		});

		expect(onDeleteList).toHaveBeenCalledWith("lst_groceries");
	});

	it("keeps delete confirmation open with stale target copy", async () => {
		const onLoadLists = jest.fn(async () => [
			listSummary({ id: "lst_groceries", name: "Groceries" }),
		]);
		renderSwitcher({
			activeLists: [listSummary({ id: "lst_groceries", name: "Groceries" })],
			onDeleteList: jest.fn(async () => ({
				status: "already-deleted" as const,
				listId: "lst_groceries",
				deletedAt: 1_700_000_000_100,
				updatedAt: 1_700_000_000_100,
			})),
			onLoadLists,
		});
		await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());

		fireEvent.press(
			screen.getByRole("button", { name: "List actions for Groceries" }),
		);
		fireEvent.press(screen.getByRole("button", { name: "Delete" }));
		await act(async () => {
			fireEvent.press(screen.getByRole("button", { name: "Delete" }));
		});

		expect(screen.getByText("List was deleted.")).toBeTruthy();
		expect(screen.getByText("Delete this List?")).toBeTruthy();
		expect(onLoadLists).toHaveBeenLastCalledWith({
			archive: "active",
			searchText: "",
		});
	});

	it("refreshes rows after stale rename target results", async () => {
		let loadCount = 0;
		const onLoadLists = jest.fn(async () => {
			loadCount += 1;
			return loadCount === 1
				? [listSummary({ id: "lst_groceries", name: "Groceries" })]
				: [];
		});
		const onRenameList = jest.fn(async () => ({
			status: "missing" as const,
			listId: "lst_groceries",
		}));
		renderSwitcher({
			activeLists: [listSummary({ id: "lst_groceries", name: "Groceries" })],
			onLoadLists,
			onRenameList,
		});
		await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());

		fireEvent.press(
			screen.getByRole("button", { name: "List actions for Groceries" }),
		);
		fireEvent.press(screen.getByRole("button", { name: "Rename" }));
		fireEvent.changeText(screen.getByLabelText("List name"), "Warehouse");
		await act(async () => {
			fireEvent.press(screen.getByRole("button", { name: "Save" }));
		});

		expect(screen.getByText("List is no longer available.")).toBeTruthy();
		expect(screen.getByText("Rename List")).toBeTruthy();
		expect(onLoadLists).toHaveBeenLastCalledWith({
			archive: "active",
			searchText: "",
		});
	});

	it("shows stale unarchive copy and refreshes rows", async () => {
		const onLoadLists = jest.fn(async () => [
			listSummary({
				id: "lst_archived",
				name: "Archived Camping",
				archived: true,
				archivedAt: 1_700_000_000_100,
			}),
		]);
		const onUnarchiveList = jest.fn(async () => ({
			status: "deleted" as const,
			listId: "lst_archived",
			deletedAt: 1_700_000_000_200,
			updatedAt: 1_700_000_000_200,
		}));
		renderSwitcher({
			activeLists: [],
			initialSegment: "archived",
			onLoadLists,
			onUnarchiveList,
		});
		await waitFor(() =>
			expect(screen.getByText("Archived Camping")).toBeTruthy(),
		);
		expect(screen.getByText("Archived Camping").props.numberOfLines).toBe(2);

		fireEvent.press(
			screen.getByRole("button", {
				name: "List actions for Archived Camping",
			}),
		);
		await act(async () => {
			fireEvent.press(screen.getByRole("button", { name: "Unarchive" }));
		});

		await waitFor(() =>
			expect(screen.getByText("List was deleted.")).toBeTruthy(),
		);
		expect(onLoadLists).toHaveBeenLastCalledWith({
			archive: "archived",
			searchText: "",
		});
	});

	it("offers rename and unarchive for archived rows without selecting them", async () => {
		const onSelectList = jest.fn();
		const onUnarchiveList = jest.fn(async () => ({
			status: "unarchived" as const,
		}));
		const onDeleteList = jest.fn(async () => ({ status: "deleted" as const }));
		renderSwitcher({
			activeLists: [],
			initialSegment: "archived",
			onSelectList,
			onDeleteList,
			onUnarchiveList,
			onLoadLists: jest.fn(async ({ archive }) =>
				archive === "archived"
					? [
							listSummary({
								id: "lst_archived",
								name: "Archived Camping",
								archived: true,
								archivedAt: 1_700_000_000_100,
							}),
						]
					: [],
			),
		});
		await waitFor(() =>
			expect(screen.getByText("Archived Camping")).toBeTruthy(),
		);

		fireEvent.press(
			screen.getByRole("button", {
				name: "List actions for Archived Camping",
			}),
		);
		expect(screen.getByRole("button", { name: "Rename" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
		await act(async () => {
			fireEvent.press(screen.getByRole("button", { name: "Unarchive" }));
		});

		expect(onUnarchiveList).toHaveBeenCalledWith("lst_archived");
		expect(onSelectList).not.toHaveBeenCalled();
	});

	it("uses the requested initial segment each time it opens", async () => {
		const onLoadLists = jest.fn(async ({ archive }) =>
			archive === "archived"
				? [listSummary({ id: "lst_archived", name: "Archived Camping" })]
				: [],
		);

		renderSwitcher({
			activeLists: [],
			initialSegment: "archived",
			onLoadLists,
		});

		await waitFor(() =>
			expect(onLoadLists).toHaveBeenLastCalledWith({
				archive: "archived",
				searchText: "",
			}),
		);
		expect(screen.getByText("Archived Camping")).toBeTruthy();
	});

	it("keeps create and rename inputs single-line editable fields", async () => {
		renderSwitcher({
			activeLists: [listSummary({ id: "lst_groceries", name: "Groceries" })],
			onLoadLists: jest.fn(async () => [
				listSummary({ id: "lst_groceries", name: "Groceries" }),
			]),
		});
		await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());

		fireEvent.press(screen.getByRole("button", { name: "Create List" }));
		expect(screen.getByLabelText("List name").props.multiline).toBe(false);
		fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
		fireEvent.press(
			screen.getByRole("button", { name: "List actions for Groceries" }),
		);
		fireEvent.press(screen.getByRole("button", { name: "Rename" }));
		expect(screen.getByLabelText("List name").props.multiline).toBe(false);
	});
});

function renderSwitcher({
	activeLists,
	hasArchivedLists = false,
	initialSegment = "active",
	onSelectList = jest.fn(),
	onLoadLists,
	onArchiveList,
	onDeleteList,
	onRenameList,
	onUnarchiveList,
}: {
	activeLists: ListSummary[];
	hasArchivedLists?: boolean;
	initialSegment?: ComponentProps<typeof ListSwitcher>["initialSegment"];
	onSelectList?: ComponentProps<typeof ListSwitcher>["onSelectList"];
	onLoadLists: NonNullable<ComponentProps<typeof ListSwitcher>["onLoadLists"]>;
	onArchiveList?: ComponentProps<typeof ListSwitcher>["onArchiveList"];
	onDeleteList?: ComponentProps<typeof ListSwitcher>["onDeleteList"];
	onRenameList?: ComponentProps<typeof ListSwitcher>["onRenameList"];
	onUnarchiveList?: ComponentProps<typeof ListSwitcher>["onUnarchiveList"];
}) {
	return render(
		<ListSwitcher
			visible
			activeLists={activeLists}
			hasArchivedLists={hasArchivedLists}
			currentListId={activeLists[0]?.id ?? null}
			initialSegment={initialSegment}
			onSelectList={onSelectList}
			onLoadLists={onLoadLists}
			onCreateList={jest.fn(async () => ({ status: "created" as const }))}
			onArchiveList={onArchiveList}
			onDeleteList={onDeleteList}
			onUnarchiveList={onUnarchiveList}
			onClose={jest.fn()}
			canRenameLists
			onRenameList={
				onRenameList ?? jest.fn(async () => ({ status: "renamed" as const }))
			}
		/>,
	);
}

function listSummary(overrides: Partial<ListSummary> = {}): ListSummary {
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
