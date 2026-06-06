import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { eq } from "drizzle-orm";
import { items, lists } from "@/db/schema/household";
import { DEFAULT_LIST_ID } from "@/lib/bootstrap";
import { deferred } from "@/lib/test/async";
import {
	createHomeSessionHarness,
	HomeScreenView,
	mockCurrentListSelectionStore,
	openAddItemComposer,
	openRenameForList,
	renderWithSafeArea,
	resetHomeTestMocks,
} from "@/lib/test/home-screen-test-support";
import { analyticsMocks } from "@/lib/test/mocks/analytics";

describe("Home Current List rename", () => {
	beforeEach(resetHomeTestMocks);

	it("renames the Current List from the switcher, requests sync, and updates the Home header", async () => {
		const harness = await createHomeSessionHarness();

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			fireEvent.press(screen.getByLabelText("Current List, Groceries"));
			expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
			openRenameForList("Groceries");

			expect(screen.getByText("Rename List")).toBeTruthy();
			expect(screen.getByLabelText("List name").props.value).toBe("Groceries");

			fireEvent.changeText(screen.getByLabelText("List name"), " Warehouse ");
			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Save" }));
			});

			await waitFor(() =>
				expect(screen.getByLabelText("Current List, Warehouse")).toBeTruthy(),
			);
			openAddItemComposer();
			expect(screen.getByLabelText("Selected List: Warehouse")).toBeTruthy();
			expect(screen.getByLabelText("List switcher")).toBeTruthy();
			expect(screen.queryByText("Rename List")).toBeNull();
			await expect(
				harness.household.db.query.lists.findFirst({
					where: (table, { eq }) => eq(table.id, DEFAULT_LIST_ID),
				}),
			).resolves.toMatchObject({
				name: "Warehouse",
				updatedAt: expect.any(Number),
			});
			expect(harness.syncRequestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			});
			expect(analyticsMocks.track).toHaveBeenCalledWith("list_renamed", {
				household_id: harness.scenario.household.id,
				list_id: DEFAULT_LIST_ID,
				user_id: harness.scenario.users.avery.id,
			});
			expect(JSON.stringify(analyticsMocks.track.mock.calls)).not.toContain(
				"Warehouse",
			);
		} finally {
			await harness.close();
		}
	});

	it("renames a non-current List without changing Current List selection", async () => {
		const harness = await createHomeSessionHarness({
			includeWeekendList: true,
		});

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			fireEvent.press(screen.getByLabelText("Current List, Groceries"));
			openRenameForList("Weekend");
			fireEvent.changeText(screen.getByLabelText("List name"), "Road Trip");
			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Save" }));
			});

			await waitFor(() => expect(screen.getByText("Road Trip")).toBeTruthy());
			expect(screen.getByLabelText("Current List, Groceries")).toBeTruthy();
			expect(
				mockCurrentListSelectionStore.writeSelection,
			).not.toHaveBeenCalled();
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_switched",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("renames an archived Current List and refreshes Home metadata", async () => {
		mockCurrentListSelectionStore.readSelection.mockResolvedValue(
			"lst_archived",
		);
		const harness = await createHomeSessionHarness({
			includeArchivedList: true,
			includeWeekendList: true,
		});

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);
			await waitFor(() =>
				expect(screen.getByText("Archived Camping")).toBeTruthy(),
			);
			fireEvent.press(screen.getByLabelText("Current List, Archived Camping"));
			await waitFor(() =>
				expect(
					screen.getByRole("button", {
						name: "List actions for Archived Camping",
					}),
				).toBeTruthy(),
			);
			openRenameForList("Archived Camping");
			fireEvent.changeText(screen.getByLabelText("List name"), "Backpacking");
			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Save" }));
			});

			await waitFor(() =>
				expect(screen.getByLabelText("Current List, Backpacking")).toBeTruthy(),
			);
			expect(screen.getByText("This List is archived")).toBeTruthy();
			expect(harness.syncRequestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			});
		} finally {
			await harness.close();
		}
	});

	it("treats same-name rename as a no-op without sync or analytics", async () => {
		const harness = await createHomeSessionHarness();
		const before = await harness.household.db.query.lists.findFirst({
			where: (table, { eq }) => eq(table.id, DEFAULT_LIST_ID),
		});

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			fireEvent.press(screen.getByLabelText("Current List, Groceries"));
			openRenameForList("Groceries");
			fireEvent.changeText(screen.getByLabelText("List name"), " Groceries ");
			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Save" }));
			});

			await waitFor(() => expect(screen.queryByText("Rename List")).toBeNull());
			await expect(
				harness.household.db.query.lists.findFirst({
					where: (table, { eq }) => eq(table.id, DEFAULT_LIST_ID),
				}),
			).resolves.toMatchObject({
				name: "Groceries",
				updatedAt: before?.updatedAt,
			});
			expect(harness.syncRequestSync).not.toHaveBeenCalled();
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_renamed",
				expect.anything(),
			);
			expect(harness.renameListCount()).toBe(0);
		} finally {
			await harness.close();
		}
	});

	it("reconciles Current List metadata when submitted rename is already persisted", async () => {
		const harness = await createHomeSessionHarness();
		const before = await harness.household.db.query.lists.findFirst({
			where: (table, { eq }) => eq(table.id, DEFAULT_LIST_ID),
		});

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			fireEvent.press(screen.getByLabelText("Current List, Groceries"));
			openRenameForList("Groceries");
			await harness.household.db
				.update(lists)
				.set({
					name: "Warehouse",
					updatedAt: (before?.updatedAt ?? 0) + 1_000,
				})
				.where(eq(lists.id, DEFAULT_LIST_ID));
			fireEvent.changeText(screen.getByLabelText("List name"), "Warehouse");
			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Save" }));
			});

			await waitFor(() =>
				expect(screen.getByLabelText("Current List, Warehouse")).toBeTruthy(),
			);
			expect(
				screen.getByRole("button", { name: /Warehouse, current List/ }),
			).toBeTruthy();
			openAddItemComposer();
			expect(screen.getByLabelText("Selected List: Warehouse")).toBeTruthy();
			expect(harness.renameListCount()).toBe(1);
			expect(harness.syncRequestSync).not.toHaveBeenCalled();
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_renamed",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("keeps rename open for stale targets and valid-submit failures", async () => {
		const missingHarness = await createHomeSessionHarness({
			includeWeekendList: true,
		});

		try {
			const rendered = renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={missingHarness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			fireEvent.press(screen.getByLabelText("Current List, Groceries"));
			openRenameForList("Weekend");
			await missingHarness.household.db
				.delete(items)
				.where(eq(items.listId, "lst_weekend"));
			await missingHarness.household.db
				.delete(lists)
				.where(eq(lists.id, "lst_weekend"));
			fireEvent.changeText(screen.getByLabelText("List name"), "Road Trip");
			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Save" }));
			});

			expect(screen.getByText("List is no longer available.")).toBeTruthy();
			expect(screen.getByText("Rename List")).toBeTruthy();
			expect(screen.queryByText("Weekend")).toBeNull();
			rendered.unmount();
		} finally {
			await missingHarness.close();
		}

		const deletedHarness = await createHomeSessionHarness({
			includeWeekendList: true,
		});

		try {
			const rendered = renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={deletedHarness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			fireEvent.press(screen.getByLabelText("Current List, Groceries"));
			openRenameForList("Weekend");
			await deletedHarness.household.db
				.update(lists)
				.set({ deletedAt: 1_700_000_001_000 })
				.where(eq(lists.id, "lst_weekend"));
			fireEvent.changeText(screen.getByLabelText("List name"), "Road Trip");
			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Save" }));
			});

			expect(screen.getByText("List was deleted.")).toBeTruthy();
			expect(screen.getByText("Rename List")).toBeTruthy();
			expect(screen.queryByText("Weekend")).toBeNull();
			rendered.unmount();
		} finally {
			await deletedHarness.close();
		}

		const failureHarness = await createHomeSessionHarness({
			failRenameList: true,
		});

		try {
			const rendered = renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={failureHarness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			fireEvent.press(screen.getByLabelText("Current List, Groceries"));
			openRenameForList("Groceries");
			fireEvent.changeText(screen.getByLabelText("List name"), "Warehouse");
			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Save" }));
			});

			expect(screen.getByText("List could not be renamed.")).toBeTruthy();
			expect(screen.getByLabelText("List name").props.value).toBe("Warehouse");
			expect(failureHarness.syncRequestSync).not.toHaveBeenCalled();
			rendered.unmount();
		} finally {
			await failureHarness.close();
		}
	});

	it("recovers Home when the Current List rename target is deleted before submit", async () => {
		const harness = await createHomeSessionHarness({
			includeWeekendList: true,
		});

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			fireEvent.press(screen.getByLabelText("Current List, Groceries"));
			openRenameForList("Groceries");
			await harness.household.db
				.update(lists)
				.set({ deletedAt: 1_700_000_001_000 })
				.where(eq(lists.id, DEFAULT_LIST_ID));
			fireEvent.changeText(screen.getByLabelText("List name"), "Warehouse");
			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Save" }));
			});

			expect(screen.getByText("List was deleted.")).toBeTruthy();
			await waitFor(() =>
				expect(screen.getByLabelText("Current List, Weekend")).toBeTruthy(),
			);
			expect(screen.queryByText("Groceries")).toBeNull();
			expect(harness.syncRequestSync).not.toHaveBeenCalled();
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_renamed",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("discards rename drafts on cancel and ignores duplicate rename submits", async () => {
		const renameGate = deferred<void>();
		const harness = await createHomeSessionHarness({
			renameListGate: renameGate.promise,
		});

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			fireEvent.press(screen.getByLabelText("Current List, Groceries"));
			openRenameForList("Groceries");
			fireEvent.changeText(screen.getByLabelText("List name"), "Warehouse");
			fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
			openRenameForList("Groceries");
			expect(screen.getByLabelText("List name").props.value).toBe("Groceries");

			fireEvent.changeText(screen.getByLabelText("List name"), "Warehouse");
			fireEvent.press(screen.getByRole("button", { name: "Save" }));
			await waitFor(() =>
				expect(
					screen.getByRole("button", { name: "Saving" }).props
						.accessibilityState,
				).toEqual({ disabled: true }),
			);
			fireEvent.press(screen.getByRole("button", { name: "Saving" }));
			expect(harness.renameListCount()).toBe(1);
			await act(async () => {
				renameGate.resolve();
				await renameGate.promise;
			});
			await waitFor(() =>
				expect(screen.getByLabelText("Current List, Warehouse")).toBeTruthy(),
			);
		} finally {
			await harness.close();
		}
	});
});
