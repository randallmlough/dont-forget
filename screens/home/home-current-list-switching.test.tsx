import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { eq } from "drizzle-orm";
import { FlatList } from "react-native";
import { itemChecks, items, lists } from "@/db/schema/household";
import { deferred } from "@/lib/test/async";
import {
	createHomeSessionHarness,
	HomeScreenView,
	mockCurrentListSelectionStore,
	renderWithSafeArea,
	resetHomeTestMocks,
} from "@/lib/test/home-screen-test-support";
import { analyticsMocks } from "@/lib/test/mocks/analytics";

describe("Home Current List switching", () => {
	beforeEach(resetHomeTestMocks);

	it("opens the List switcher from the Home Current List title and marks the Current List", async () => {
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

			expect(screen.getByLabelText("List switcher")).toBeTruthy();
			expect(
				screen.getByRole("button", { name: /Groceries, current List/ }).props
					.accessibilityState,
			).toEqual(expect.objectContaining({ selected: true }));
			expect(
				screen.getByRole("button", { name: /Weekend, \d+ unchecked/ }),
			).toBeTruthy();
		} finally {
			await harness.close();
		}
	});

	it("treats tapping the current List row as a no-op without analytics", async () => {
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
			await act(async () => {
				fireEvent.press(
					screen.getByRole("button", { name: /Groceries, current List/ }),
				);
			});

			expect(
				mockCurrentListSelectionStore.writeSelection,
			).not.toHaveBeenCalled();
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_switched",
				expect.anything(),
			);
			expect(screen.getByLabelText("List switcher")).toBeTruthy();
			expect(harness.syncRequestSync).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("persists a different Current List selection, closes the switcher, updates Home, emits analytics, and does not request sync", async () => {
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

			await act(async () => {
				fireEvent.press(
					screen.getByRole("button", { name: /Weekend, \d+ unchecked/ }),
				);
			});

			await waitFor(() => expect(screen.getByText("Weekend")).toBeTruthy());
			expect(screen.getByText("Apples")).toBeTruthy();
			expect(screen.queryByLabelText("List switcher")).toBeNull();
			expect(mockCurrentListSelectionStore.writeSelection).toHaveBeenCalledWith(
				{
					userId: harness.scenario.users.avery.id,
					householdId: harness.scenario.household.id,
					listId: "lst_weekend",
				},
				{ shouldCommit: expect.any(Function) },
			);
			expect(analyticsMocks.track).toHaveBeenCalledWith("list_switched", {
				household_id: harness.scenario.household.id,
				list_id: "lst_weekend",
				user_id: harness.scenario.users.avery.id,
			});
			expect(harness.syncRequestSync).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("does not persist, emit analytics, close the switcher, or replace Home when the target List fails to load", async () => {
		const harness = await createHomeSessionHarness({
			failListReadForListIds: ["lst_weekend"],
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

			await act(async () => {
				fireEvent.press(
					screen.getByRole("button", { name: /Weekend, \d+ unchecked/ }),
				);
			});

			expect(
				mockCurrentListSelectionStore.writeSelection,
			).not.toHaveBeenCalled();
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_switched",
				expect.anything(),
			);
			expect(screen.getByLabelText("List switcher")).toBeTruthy();
			expect(screen.getByLabelText("Current List, Groceries")).toBeTruthy();
			expect(screen.getByText("Milk")).toBeTruthy();
			expect(screen.queryByText("Apples")).toBeNull();
		} finally {
			await harness.close();
		}
	});

	it("ignores a second List switch while one switch is in flight", async () => {
		const weekendRead = deferred<void>();
		const harness = await createHomeSessionHarness({
			includeWeekendList: true,
			extraActiveListCount: 1,
			listReadGatesByListId: {
				lst_weekend: weekendRead.promise,
			},
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

			fireEvent.press(
				screen.getByRole("button", { name: /Weekend, \d+ unchecked/ }),
			);
			await waitFor(() =>
				expect(
					screen.getByRole("button", {
						name: /Extra List 1, \d+ unchecked/,
					}).props.accessibilityState,
				).toEqual({ disabled: true, selected: false }),
			);
			fireEvent.press(
				screen.getByRole("button", { name: /Extra List 1, \d+ unchecked/ }),
			);
			expect(
				mockCurrentListSelectionStore.writeSelection,
			).not.toHaveBeenCalled();

			await act(async () => {
				weekendRead.resolve();
				await weekendRead.promise;
			});

			await waitFor(() => expect(screen.getByText("Weekend")).toBeTruthy());
			expect(
				mockCurrentListSelectionStore.writeSelection,
			).toHaveBeenCalledTimes(1);
			expect(mockCurrentListSelectionStore.writeSelection).toHaveBeenCalledWith(
				{
					userId: harness.scenario.users.avery.id,
					householdId: harness.scenario.household.id,
					listId: "lst_weekend",
				},
				{ shouldCommit: expect.any(Function) },
			);
			expect(analyticsMocks.track).toHaveBeenCalledTimes(1);
			expect(analyticsMocks.track).toHaveBeenCalledWith("list_switched", {
				household_id: harness.scenario.household.id,
				list_id: "lst_weekend",
				user_id: harness.scenario.users.avery.id,
			});
			expect(screen.queryByText("Extra List 1")).toBeNull();
		} finally {
			await harness.close();
		}
	});

	it("resolves a stored Current List selection after local reload", async () => {
		mockCurrentListSelectionStore.readSelection.mockResolvedValue(
			"lst_weekend",
		);
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

			await waitFor(() => expect(screen.getByText("Weekend")).toBeTruthy());
			expect(screen.getByText("Apples")).toBeTruthy();
		} finally {
			await harness.close();
		}
	});

	it("renders a deleted Current List state for a stored deleted selection", async () => {
		mockCurrentListSelectionStore.readSelection.mockResolvedValue(
			"lst_deleted",
		);
		const harness = await createHomeSessionHarness({
			includeDeletedList: true,
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
				expect(screen.getByText("This List was deleted.")).toBeTruthy(),
			);
			expect(
				screen.getByText("Switch to another List or create a new one."),
			).toBeTruthy();
			expect(screen.queryByText("Milk")).toBeNull();
			expect(screen.queryByText("Deleted")).toBeNull();
		} finally {
			await harness.close();
		}
	});

	it("renders active List switcher rows through a scrollable list", async () => {
		const harness = await createHomeSessionHarness({
			extraActiveListCount: 18,
		});

		try {
			const rendered = renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());

			fireEvent.press(screen.getByLabelText("Current List, Groceries"));

			const switcherList = rendered
				.UNSAFE_getAllByType(FlatList)
				.find((list) => list.props.data?.length === 19);
			expect(switcherList).toBeTruthy();
			expect(screen.getByLabelText("List switcher")).toBeTruthy();
		} finally {
			await harness.close();
		}
	});

	it("archives the Current List, requests sync, and switches to the next active List", async () => {
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
			fireEvent.press(
				screen.getByRole("button", { name: "List actions for Groceries" }),
			);
			fireEvent.press(screen.getByRole("button", { name: "Archive" }));
			expect(screen.getByText("Archive this List?")).toBeTruthy();

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Archive" }));
			});

			await waitFor(() => expect(screen.getByText("Weekend")).toBeTruthy());
			expect(harness.syncRequestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			});
			expect(mockCurrentListSelectionStore.writeSelection).toHaveBeenCalledWith(
				{
					userId: harness.scenario.users.avery.id,
					householdId: harness.scenario.household.id,
					listId: "lst_weekend",
				},
				{ shouldCommit: expect.any(Function) },
			);
			await expect(
				harness.household.db.query.lists.findFirst({
					where: (table, { eq }) =>
						eq(table.id, harness.scenario.ids.groceriesListId),
				}),
			).resolves.toMatchObject({
				archivedAt: expect.any(Number),
			});
		} finally {
			await harness.close();
		}
	});

	it("clears stored selection when archiving the only active Current List", async () => {
		const harness = await createHomeSessionHarness();
		let storedListId: string | null = harness.scenario.ids.groceriesListId;
		mockCurrentListSelectionStore.readSelection.mockImplementation(
			async () => storedListId,
		);
		mockCurrentListSelectionStore.clearSelection.mockImplementation(
			async (scope) => {
				if (
					scope.userId === harness.scenario.users.avery.id &&
					scope.householdId === harness.scenario.household.id
				) {
					storedListId = null;
				}
			},
		);

		try {
			const rendered = renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			fireEvent.press(screen.getByLabelText("Current List, Groceries"));
			fireEvent.press(
				screen.getByRole("button", { name: "List actions for Groceries" }),
			);
			fireEvent.press(screen.getByRole("button", { name: "Archive" }));

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Archive" }));
			});

			await waitFor(() =>
				expect(screen.getByText("No active Lists")).toBeTruthy(),
			);
			expect(mockCurrentListSelectionStore.clearSelection).toHaveBeenCalledWith(
				{
					userId: harness.scenario.users.avery.id,
					householdId: harness.scenario.household.id,
				},
				{ shouldCommit: expect.any(Function) },
			);

			rendered.unmount();
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() =>
				expect(screen.getByText("No active Lists")).toBeTruthy(),
			);
			expect(screen.queryByText("This List is archived")).toBeNull();
		} finally {
			await harness.close();
		}
	});

	it("archives a non-current List without closing the switcher", async () => {
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
			fireEvent.press(
				screen.getByRole("button", { name: "List actions for Weekend" }),
			);
			fireEvent.press(screen.getByRole("button", { name: "Archive" }));

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Archive" }));
			});

			await waitFor(() =>
				expect(screen.getByLabelText("List switcher")).toBeTruthy(),
			);
			expect(screen.getByLabelText("Current List, Groceries")).toBeTruthy();
			expect(screen.queryByText("Weekend")).toBeNull();
			expect(harness.syncRequestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			});
		} finally {
			await harness.close();
		}
	});

	it("reconciles a sync-archived Current List after archiving a non-current row", async () => {
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
			fireEvent.press(
				screen.getByRole("button", { name: "List actions for Weekend" }),
			);
			fireEvent.press(screen.getByRole("button", { name: "Archive" }));
			await harness.household.db
				.update(lists)
				.set({
					archivedAt: 1_700_000_001_000,
					updatedAt: 1_700_000_001_000,
				})
				.where(eq(lists.id, harness.scenario.ids.groceriesListId));

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Archive" }));
			});

			await waitFor(() =>
				expect(screen.getByText("This List is archived")).toBeTruthy(),
			);
			expect(screen.getByLabelText("Current List, Groceries")).toBeTruthy();
			expect(screen.getByText("Milk")).toBeTruthy();
			expect(screen.queryByLabelText("Add Item")).toBeNull();
			expect(
				mockCurrentListSelectionStore.writeSelection,
			).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("reports infrastructure failures with generic copy and technical logs", async () => {
		const harness = await createHomeSessionHarness({
			includeWeekendList: true,
		});
		const { logger: appLogger } = jest.requireMock(
			"@/lib/logger",
		) as typeof import("@/lib/logger");
		jest.mocked(appLogger.error).mockClear();
		harness.session.services.lists.archiveList = jest.fn(async () => {
			throw new Error("database unavailable");
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
			fireEvent.press(
				screen.getByRole("button", { name: "List actions for Weekend" }),
			);
			fireEvent.press(screen.getByRole("button", { name: "Archive" }));

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Archive" }));
			});

			expect(screen.getByText("List could not be archived.")).toBeTruthy();
			expect(appLogger.error).toHaveBeenCalledWith(
				"Home Current List operation failed",
				expect.objectContaining({
					error: expect.objectContaining({ message: "database unavailable" }),
				}),
			);
			expect(harness.syncRequestSync).not.toHaveBeenCalled();
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_archived",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("unarchives an archived List from the switcher and makes it Current", async () => {
		const harness = await createHomeSessionHarness({
			includeArchivedList: true,
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
			fireEvent.press(screen.getByRole("button", { name: "Archived" }));
			await waitFor(() =>
				expect(screen.getByText("Archived Camping")).toBeTruthy(),
			);
			fireEvent.press(
				screen.getByRole("button", {
					name: "List actions for Archived Camping",
				}),
			);

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Unarchive" }));
			});

			await waitFor(() =>
				expect(screen.getByText("Archived Camping")).toBeTruthy(),
			);
			expect(screen.getByText("Marshmallows")).toBeTruthy();
			expect(screen.queryByLabelText("List switcher")).toBeNull();
			expect(harness.syncRequestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			});
			expect(mockCurrentListSelectionStore.writeSelection).toHaveBeenCalledWith(
				{
					userId: harness.scenario.users.avery.id,
					householdId: harness.scenario.household.id,
					listId: "lst_archived",
				},
				{ shouldCommit: expect.any(Function) },
			);
		} finally {
			await harness.close();
		}
	});

	it("refreshes zero-active parent state after a stale unarchive target", async () => {
		const harness = await createHomeSessionHarness({
			includeArchivedList: true,
		});
		await harness.household.db
			.update(lists)
			.set({ deletedAt: 1_700_000_002_000, updatedAt: 1_700_000_002_000 })
			.where(eq(lists.id, harness.scenario.ids.groceriesListId));

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);
			await waitFor(() =>
				expect(screen.getByText("No active Lists")).toBeTruthy(),
			);
			fireEvent.press(screen.getByRole("button", { name: "View Archived" }));
			await waitFor(() =>
				expect(screen.getByText("Archived Camping")).toBeTruthy(),
			);
			await harness.household.db
				.update(lists)
				.set({ deletedAt: 1_700_000_003_000, updatedAt: 1_700_000_003_000 })
				.where(eq(lists.id, "lst_archived"));
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
			fireEvent.press(screen.getByRole("button", { name: "Close" }));

			await waitFor(() =>
				expect(screen.getByText("No active Lists")).toBeTruthy(),
			);
			expect(
				screen.queryByRole("button", { name: "View Archived" }),
			).toBeNull();
			expect(harness.syncRequestSync).not.toHaveBeenCalled();
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_unarchived",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("refreshes deleted-current parent state after a stale unarchive target", async () => {
		mockCurrentListSelectionStore.readSelection.mockResolvedValue(
			"lst_deleted",
		);
		const harness = await createHomeSessionHarness({
			includeArchivedList: true,
			includeDeletedList: true,
		});
		await harness.household.db
			.update(lists)
			.set({ deletedAt: 1_700_000_002_000, updatedAt: 1_700_000_002_000 })
			.where(eq(lists.id, harness.scenario.ids.groceriesListId));

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);
			await waitFor(() =>
				expect(screen.getByText("This List was deleted.")).toBeTruthy(),
			);
			fireEvent.press(screen.getByRole("button", { name: "Switch List" }));
			await waitFor(() =>
				expect(screen.getByRole("button", { name: "View Archived" })),
			);
			fireEvent.press(screen.getByRole("button", { name: "View Archived" }));
			await waitFor(() =>
				expect(screen.getByText("Archived Camping")).toBeTruthy(),
			);
			await harness.household.db
				.update(lists)
				.set({ deletedAt: 1_700_000_003_000, updatedAt: 1_700_000_003_000 })
				.where(eq(lists.id, "lst_archived"));
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
			fireEvent.press(screen.getByRole("button", { name: "Close" }));
			fireEvent.press(screen.getByRole("button", { name: "Switch List" }));

			await waitFor(() =>
				expect(screen.getByText("No active Lists")).toBeTruthy(),
			);
			expect(
				screen.queryByRole("button", { name: "View Archived" }),
			).toBeNull();
			expect(harness.syncRequestSync).not.toHaveBeenCalled();
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_unarchived",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("deletes the Current List, requests sync, and switches to the next active List", async () => {
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
			fireEvent.press(
				screen.getByRole("button", { name: "List actions for Groceries" }),
			);
			fireEvent.press(screen.getByRole("button", { name: "Delete" }));
			expect(screen.getByText("Delete this List?")).toBeTruthy();
			expect(
				screen.getByText(
					"Groceries will be removed from the app. This cannot be undone.",
				),
			).toBeTruthy();

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Delete" }));
			});

			await waitFor(() => expect(screen.getByText("Weekend")).toBeTruthy());
			expect(screen.queryByLabelText("List switcher")).toBeNull();
			expect(harness.syncRequestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			});
			expect(mockCurrentListSelectionStore.writeSelection).toHaveBeenCalledWith(
				{
					userId: harness.scenario.users.avery.id,
					householdId: harness.scenario.household.id,
					listId: "lst_weekend",
				},
				{ shouldCommit: expect.any(Function) },
			);
			await expect(
				harness.household.db.query.lists.findFirst({
					where: (table, { eq }) =>
						eq(table.id, harness.scenario.ids.groceriesListId),
				}),
			).resolves.toMatchObject({
				deletedAt: expect.any(Number),
			});
		} finally {
			await harness.close();
		}
	});

	it("deletes a non-current active List without closing the switcher", async () => {
		const syncGate = deferred<void>();
		const harness = await createHomeSessionHarness({
			includeWeekendList: true,
			syncRequestGate: syncGate.promise,
			syncStatus: "offline",
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
			fireEvent.press(
				screen.getByRole("button", { name: "List actions for Weekend" }),
			);
			fireEvent.press(screen.getByRole("button", { name: "Delete" }));

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Delete" }));
			});

			await waitFor(() =>
				expect(screen.getByLabelText("List switcher")).toBeTruthy(),
			);
			expect(screen.getByLabelText("Current List, Groceries")).toBeTruthy();
			expect(screen.queryByText("Weekend")).toBeNull();
			expect(harness.syncRequestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			});
			expect(analyticsMocks.track).toHaveBeenCalledWith("list_deleted", {
				household_id: harness.scenario.household.id,
				list_id: "lst_weekend",
				user_id: harness.scenario.users.avery.id,
			});
		} finally {
			syncGate.resolve();
			await harness.close();
		}
	});

	it("reconciles a sync-deleted Current List after deleting a non-current row", async () => {
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
			fireEvent.press(
				screen.getByRole("button", { name: "List actions for Weekend" }),
			);
			fireEvent.press(screen.getByRole("button", { name: "Delete" }));
			await harness.household.db
				.update(lists)
				.set({
					deletedAt: 1_700_000_001_000,
					updatedAt: 1_700_000_001_000,
				})
				.where(eq(lists.id, harness.scenario.ids.groceriesListId));

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Delete" }));
			});

			await waitFor(() =>
				expect(screen.getByText("This List was deleted.")).toBeTruthy(),
			);
			expect(screen.queryByText("Milk")).toBeNull();
			expect(screen.queryByLabelText("Current List, Groceries")).toBeNull();
			expect(harness.syncRequestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			});
			expect(
				mockCurrentListSelectionStore.writeSelection,
			).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("shows stale deleted copy without sync or analytics for non-current delete targets", async () => {
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
			fireEvent.press(
				screen.getByRole("button", { name: "List actions for Weekend" }),
			);
			fireEvent.press(screen.getByRole("button", { name: "Delete" }));
			await harness.household.db
				.update(lists)
				.set({
					deletedAt: 1_700_000_001_000,
					updatedAt: 1_700_000_001_000,
				})
				.where(eq(lists.id, "lst_weekend"));

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Delete" }));
			});

			await waitFor(() =>
				expect(screen.getByText("List was deleted.")).toBeTruthy(),
			);
			expect(screen.getByLabelText("Current List, Groceries")).toBeTruthy();
			expect(screen.queryByText("Weekend")).toBeNull();
			expect(harness.syncRequestSync).not.toHaveBeenCalled();
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_deleted",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("shows stale missing copy without sync or analytics for non-current delete targets", async () => {
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
			fireEvent.press(
				screen.getByRole("button", { name: "List actions for Weekend" }),
			);
			fireEvent.press(screen.getByRole("button", { name: "Delete" }));
			await harness.household.db.delete(itemChecks);
			await harness.household.db
				.delete(items)
				.where(eq(items.listId, "lst_weekend"));
			await harness.household.db
				.delete(lists)
				.where(eq(lists.id, "lst_weekend"));

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Delete" }));
			});

			await waitFor(() =>
				expect(screen.getByText("List is no longer available.")).toBeTruthy(),
			);
			expect(screen.getByLabelText("Current List, Groceries")).toBeTruthy();
			expect(screen.queryByText("Weekend")).toBeNull();
			expect(harness.syncRequestSync).not.toHaveBeenCalled();
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_deleted",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("shows stale deleted copy without sync or analytics for non-current archive targets", async () => {
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
			fireEvent.press(
				screen.getByRole("button", { name: "List actions for Weekend" }),
			);
			fireEvent.press(screen.getByRole("button", { name: "Archive" }));
			await harness.household.db
				.update(lists)
				.set({
					deletedAt: 1_700_000_001_000,
					updatedAt: 1_700_000_001_000,
				})
				.where(eq(lists.id, "lst_weekend"));

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Archive" }));
			});

			await waitFor(() =>
				expect(screen.getByText("List was deleted.")).toBeTruthy(),
			);
			expect(screen.getByLabelText("Current List, Groceries")).toBeTruthy();
			expect(screen.queryByText("Weekend")).toBeNull();
			expect(harness.syncRequestSync).not.toHaveBeenCalled();
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_archived",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("treats stale deleted Current List archive as sync-discovered lifecycle", async () => {
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
			fireEvent.press(
				screen.getByRole("button", { name: "List actions for Groceries" }),
			);
			fireEvent.press(screen.getByRole("button", { name: "Archive" }));
			await harness.household.db
				.update(lists)
				.set({
					deletedAt: 1_700_000_001_000,
					updatedAt: 1_700_000_001_000,
				})
				.where(eq(lists.id, harness.scenario.ids.groceriesListId));

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Archive" }));
			});

			await waitFor(() =>
				expect(screen.getByText("This List was deleted.")).toBeTruthy(),
			);
			expect(screen.queryByLabelText("List switcher")).toBeNull();
			expect(screen.queryByText("Milk")).toBeNull();
			expect(harness.syncRequestSync).not.toHaveBeenCalled();
			expect(
				mockCurrentListSelectionStore.writeSelection,
			).not.toHaveBeenCalled();
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_archived",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("closes current delete confirmation when the Current List was already deleted", async () => {
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
			fireEvent.press(
				screen.getByRole("button", { name: "List actions for Groceries" }),
			);
			fireEvent.press(screen.getByRole("button", { name: "Delete" }));
			await harness.household.db
				.update(lists)
				.set({
					deletedAt: 1_700_000_001_000,
					updatedAt: 1_700_000_001_000,
				})
				.where(eq(lists.id, harness.scenario.ids.groceriesListId));

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Delete" }));
			});

			await waitFor(() =>
				expect(screen.getByText("This List was deleted.")).toBeTruthy(),
			);
			expect(screen.queryByLabelText("List switcher")).toBeNull();
			expect(screen.queryByText("Milk")).toBeNull();
			expect(harness.syncRequestSync).not.toHaveBeenCalled();
			expect(
				mockCurrentListSelectionStore.writeSelection,
			).not.toHaveBeenCalled();
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_deleted",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("deletes an archived List from the Archived segment", async () => {
		const harness = await createHomeSessionHarness({
			includeArchivedList: true,
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
			fireEvent.press(screen.getByRole("button", { name: "Archived" }));
			await waitFor(() =>
				expect(screen.getByText("Archived Camping")).toBeTruthy(),
			);
			fireEvent.press(
				screen.getByRole("button", {
					name: "List actions for Archived Camping",
				}),
			);
			fireEvent.press(screen.getByRole("button", { name: "Delete" }));

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Delete" }));
			});

			await waitFor(() =>
				expect(screen.getByText("No archived Lists")).toBeTruthy(),
			);
			expect(harness.syncRequestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			});
		} finally {
			await harness.close();
		}
	});

	it("shows sync-discovered deleted Current List state without stale Items", async () => {
		mockCurrentListSelectionStore.readSelection.mockResolvedValue(
			"lst_deleted",
		);
		const harness = await createHomeSessionHarness({
			includeDeletedList: true,
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
				expect(screen.getByText("This List was deleted.")).toBeTruthy(),
			);
			expect(
				screen.getByText("Switch to another List or create a new one."),
			).toBeTruthy();
			expect(screen.queryByText("Milk")).toBeNull();
			expect(screen.queryByLabelText("Current List, Deleted")).toBeNull();

			fireEvent.press(screen.getByRole("button", { name: "Switch List" }));
			await waitFor(() =>
				expect(screen.getByRole("button", { name: /Weekend, \d+ unchecked/ })),
			);
			await act(async () => {
				fireEvent.press(
					screen.getByRole("button", { name: /Weekend, \d+ unchecked/ }),
				);
			});
			await waitFor(() => expect(screen.getByText("Weekend")).toBeTruthy());
			expect(screen.getByText("Apples")).toBeTruthy();
			expect(mockCurrentListSelectionStore.writeSelection).toHaveBeenCalledWith(
				expect.objectContaining({ listId: "lst_weekend" }),
				expect.any(Object),
			);
		} finally {
			await harness.close();
		}
	});

	it("creates a new Current List from deleted Current List state", async () => {
		mockCurrentListSelectionStore.readSelection.mockResolvedValue(
			"lst_deleted",
		);
		const harness = await createHomeSessionHarness({
			includeDeletedList: true,
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
				expect(screen.getByText("This List was deleted.")).toBeTruthy(),
			);
			fireEvent.press(screen.getByRole("button", { name: "Create List" }));
			await waitFor(() =>
				expect(screen.getByLabelText("List name")).toBeTruthy(),
			);
			fireEvent.changeText(screen.getByLabelText("List name"), "Costco");
			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Create" }));
			});
			await waitFor(() => expect(screen.getByText("Costco")).toBeTruthy());
			expect(harness.createListCount()).toBe(1);
			expect(mockCurrentListSelectionStore.writeSelection).toHaveBeenCalledWith(
				expect.objectContaining({ listId: expect.any(String) }),
				expect.any(Object),
			);
		} finally {
			await harness.close();
		}
	});

	it("shows deleted Current List state when the visible List is tombstoned on refresh", async () => {
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
			expect(screen.getByText("Milk")).toBeTruthy();

			await harness.household.db
				.update(lists)
				.set({
					deletedAt: 1_700_000_001_000,
					updatedAt: 1_700_000_001_000,
				})
				.where(eq(lists.id, harness.scenario.ids.groceriesListId));

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Refresh" }));
			});
			await waitFor(() =>
				expect(screen.getByText("This List was deleted.")).toBeTruthy(),
			);
			expect(
				screen.getByText("Switch to another List or create a new one."),
			).toBeTruthy();
			expect(screen.queryByText("Milk")).toBeNull();
			expect(screen.queryByLabelText("Current List, Groceries")).toBeNull();
			fireEvent.press(screen.getByRole("button", { name: "Switch List" }));
			await waitFor(() =>
				expect(screen.getByRole("button", { name: /Weekend, \d+ unchecked/ })),
			);
		} finally {
			await harness.close();
		}
	});

	it("keeps sync-discovered archived Current List selected and read-only on refresh", async () => {
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
			expect(screen.getByText("Milk")).toBeTruthy();

			await harness.household.db
				.update(lists)
				.set({
					archivedAt: 1_700_000_001_000,
					updatedAt: 1_700_000_001_000,
				})
				.where(eq(lists.id, harness.scenario.ids.groceriesListId));

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Refresh" }));
			});

			await waitFor(() =>
				expect(screen.getByText("This List is archived")).toBeTruthy(),
			);
			expect(screen.getByLabelText("Current List, Groceries")).toBeTruthy();
			expect(screen.getByText("Milk")).toBeTruthy();
			expect(screen.queryByLabelText("Add Item")).toBeNull();
			expect(
				mockCurrentListSelectionStore.writeSelection,
			).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("falls back when the visible Current List is missing on refresh", async () => {
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
			await harness.household.db.delete(itemChecks);
			await harness.household.db
				.delete(items)
				.where(eq(items.listId, harness.scenario.ids.groceriesListId));
			await harness.household.db
				.delete(lists)
				.where(eq(lists.id, harness.scenario.ids.groceriesListId));

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Refresh" }));
			});

			await waitFor(() => expect(screen.getByText("Weekend")).toBeTruthy());
			expect(screen.getByText("Apples")).toBeTruthy();
			expect(screen.queryByText("Milk")).toBeNull();
			expect(
				mockCurrentListSelectionStore.writeSelection,
			).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("opens the create form from deleted Current List state", async () => {
		mockCurrentListSelectionStore.readSelection.mockResolvedValue(
			"lst_deleted",
		);
		const harness = await createHomeSessionHarness({
			includeDeletedList: true,
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
				expect(screen.getByText("This List was deleted.")).toBeTruthy(),
			);
			fireEvent.press(screen.getByRole("button", { name: "Create List" }));
			await waitFor(() =>
				expect(screen.getByLabelText("List name")).toBeTruthy(),
			);
		} finally {
			await harness.close();
		}
	});

	it("clears stored selection when deleting the only active Current List", async () => {
		const harness = await createHomeSessionHarness();
		let storedListId: string | null = harness.scenario.ids.groceriesListId;
		mockCurrentListSelectionStore.readSelection.mockImplementation(
			async () => storedListId,
		);
		mockCurrentListSelectionStore.clearSelection.mockImplementation(
			async (scope) => {
				if (
					scope.userId === harness.scenario.users.avery.id &&
					scope.householdId === harness.scenario.household.id
				) {
					storedListId = null;
				}
			},
		);

		try {
			const rendered = renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			fireEvent.press(screen.getByLabelText("Current List, Groceries"));
			fireEvent.press(
				screen.getByRole("button", { name: "List actions for Groceries" }),
			);
			fireEvent.press(screen.getByRole("button", { name: "Delete" }));

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Delete" }));
			});

			await waitFor(() =>
				expect(screen.getByText("No active Lists")).toBeTruthy(),
			);
			expect(mockCurrentListSelectionStore.clearSelection).toHaveBeenCalledWith(
				{
					userId: harness.scenario.users.avery.id,
					householdId: harness.scenario.household.id,
				},
				{ shouldCommit: expect.any(Function) },
			);

			rendered.unmount();
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() =>
				expect(screen.getByText("No active Lists")).toBeTruthy(),
			);
			expect(screen.queryByText("This List was deleted.")).toBeNull();
		} finally {
			await harness.close();
		}
	});

	it("opens the create form after closing the switcher from deleted Current List state", async () => {
		mockCurrentListSelectionStore.readSelection.mockResolvedValue(
			"lst_deleted",
		);
		const harness = await createHomeSessionHarness({
			includeDeletedList: true,
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
				expect(screen.getByText("This List was deleted.")).toBeTruthy(),
			);
			fireEvent.press(screen.getByRole("button", { name: "Switch List" }));
			await waitFor(() =>
				expect(screen.getByRole("button", { name: /Weekend, \d+ unchecked/ })),
			);
			fireEvent.press(screen.getByRole("button", { name: "Close" }));
			fireEvent.press(screen.getByRole("button", { name: "Create List" }));
			await waitFor(() =>
				expect(screen.getByLabelText("List name")).toBeTruthy(),
			);
		} finally {
			await harness.close();
		}
	});

	it("renders a stored archived Current List read-only with restore and archived switch affordances", async () => {
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
			expect(screen.getByText("This List is archived")).toBeTruthy();
			expect(screen.getByText("Marshmallows")).toBeTruthy();
			expect(screen.queryByLabelText("Add Item")).toBeNull();
			expect(
				screen.getAllByRole("checkbox")[0]?.props.accessibilityState,
			).toEqual({ checked: false, disabled: true });

			fireEvent.press(screen.getByRole("button", { name: "Switch List" }));
			await waitFor(() =>
				expect(
					screen.getByRole("button", {
						name: /Archived Camping, archived List/,
					}),
				).toBeTruthy(),
			);
		} finally {
			await harness.close();
		}
	});
});
