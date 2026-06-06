import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
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

describe("Home Current List creation", () => {
	beforeEach(resetHomeTestMocks);

	it("surfaces the zero-active List foundation when no active Lists exist", async () => {
		const harness = await createHomeSessionHarness();
		await harness.household.db.delete(itemChecks);
		await harness.household.db.delete(items);
		await harness.household.db.delete(lists);

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
			expect(
				screen.getByText("Create a List to start adding Items."),
			).toBeTruthy();
			expect(screen.getByRole("button", { name: "Create List" })).toBeTruthy();
			expect(screen.queryByText("View Archived")).toBeNull();
			expect(screen.queryByLabelText("Add Item")).toBeNull();
		} finally {
			await harness.close();
		}
	});

	it("keeps archived availability in zero-active Home state", async () => {
		const harness = await createHomeSessionHarness();
		await harness.household.db.delete(itemChecks);
		await harness.household.db.delete(items);
		await harness.household.db.delete(lists);
		const listLists = harness.session.services.lists.listLists.bind(
			harness.session.services.lists,
		);
		harness.session.services.lists.listLists = jest.fn(async (input) =>
			input?.archive === "archived"
				? [
						{
							id: "lst_archived",
							householdId: harness.scenario.household.id,
							name: "Archived Camping",
							createdByUserId: harness.scenario.users.avery.id,
							createdAt: 1_700_000_000_000,
							updatedAt: 1_700_000_000_100,
							archived: true,
							archivedAt: 1_700_000_000_200,
							lastActivityAt: 1_700_000_000_100,
							uncheckedItemCount: 0,
							checkedItemCount: 0,
						},
					]
				: listLists(input),
		);

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
			fireEvent.press(screen.getByText("View Archived"));
			await waitFor(() =>
				expect(screen.getByText("Archived Camping")).toBeTruthy(),
			);
		} finally {
			await harness.close();
		}
	});

	it("creates a List from zero-active Home, persists it as Current, requests sync, and renders the empty List", async () => {
		const harness = await createHomeSessionHarness();
		await harness.household.db.delete(itemChecks);
		await harness.household.db.delete(items);
		await harness.household.db.delete(lists);

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
			fireEvent.press(screen.getByRole("button", { name: "Create List" }));
			fireEvent.changeText(screen.getByLabelText("List name"), " Costco ");
			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Create" }));
			});

			await waitFor(() => expect(screen.getByText("Costco")).toBeTruthy());
			expect(screen.queryByText("No active Lists")).toBeNull();
			expect(screen.getByLabelText("Add Item")).toBeTruthy();
			const created = await harness.household.db.query.lists.findFirst({
				where: (table, { eq }) => eq(table.name, "Costco"),
			});
			expect(created).toMatchObject({
				name: "Costco",
				createdByUserId: harness.scenario.users.avery.id,
			});
			if (!created) throw new Error("Expected created List");
			expect(mockCurrentListSelectionStore.writeSelection).toHaveBeenCalledWith(
				{
					userId: harness.scenario.users.avery.id,
					householdId: harness.scenario.household.id,
					listId: created.id,
				},
				{ shouldCommit: expect.any(Function) },
			);
			expect(harness.syncRequestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			});
			expect(analyticsMocks.track).toHaveBeenCalledWith("list_created", {
				household_id: harness.scenario.household.id,
				list_id: created.id,
				user_id: harness.scenario.users.avery.id,
			});
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_switched",
				expect.anything(),
			);
			expect(JSON.stringify(analyticsMocks.track.mock.calls)).not.toContain(
				"Costco",
			);
		} finally {
			await harness.close();
		}
	});

	it("renders a locally created List before offline sync completes", async () => {
		const syncGate = deferred<void>();
		const harness = await createHomeSessionHarness({
			syncRequestGate: syncGate.promise,
			syncStatus: "offline",
		});
		await harness.household.db.delete(itemChecks);
		await harness.household.db.delete(items);
		await harness.household.db.delete(lists);

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
			fireEvent.press(screen.getByRole("button", { name: "Create List" }));
			fireEvent.changeText(screen.getByLabelText("List name"), "Costco");
			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Create" }));
			});

			await waitFor(() => expect(screen.getByText("Costco")).toBeTruthy());
			expect(screen.queryByLabelText("List switcher")).toBeNull();
			expect(screen.getByLabelText("Add Item")).toBeTruthy();
			expect(harness.syncRequestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			});
			await expect(
				harness.household.db.query.lists.findMany({
					where: (table, { eq }) => eq(table.name, "Costco"),
				}),
			).resolves.toHaveLength(1);
		} finally {
			syncGate.resolve();
			await harness.close();
		}
	});

	it("requests sync and renders the created List when Current List selection persistence fails", async () => {
		const harness = await createHomeSessionHarness();
		await harness.household.db.delete(itemChecks);
		await harness.household.db.delete(items);
		await harness.household.db.delete(lists);
		mockCurrentListSelectionStore.writeSelection.mockRejectedValueOnce(
			new Error("storage failed"),
		);

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
			fireEvent.press(screen.getByRole("button", { name: "Create List" }));
			fireEvent.changeText(screen.getByLabelText("List name"), "Costco");
			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Create" }));
			});

			await waitFor(() => expect(screen.getByText("Costco")).toBeTruthy());
			expect(
				screen.queryByText("Unable to create this List. Please try again."),
			).toBeNull();
			expect(screen.queryByLabelText("List switcher")).toBeNull();
			expect(screen.getByLabelText("Add Item")).toBeTruthy();
			expect(harness.createListCount()).toBe(1);
			await expect(
				harness.household.db.query.lists.findMany({
					where: (table, { eq }) => eq(table.name, "Costco"),
				}),
			).resolves.toHaveLength(1);
			expect(harness.syncRequestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			});
			expect(analyticsMocks.track).toHaveBeenCalledWith("list_created", {
				household_id: harness.scenario.household.id,
				list_id: expect.any(String),
				user_id: harness.scenario.users.avery.id,
			});
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_switched",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("creates a duplicate named List from the switcher without emitting list_switched", async () => {
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
			fireEvent.press(screen.getByRole("button", { name: "Create List" }));
			fireEvent.changeText(screen.getByLabelText("List name"), "Weekend");
			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Create" }));
			});

			await waitFor(() => expect(screen.getByText("Weekend")).toBeTruthy());
			expect(screen.queryByLabelText("List switcher")).toBeNull();
			await expect(
				harness.household.db.query.lists.findMany({
					where: (table, { eq }) => eq(table.name, "Weekend"),
				}),
			).resolves.toHaveLength(2);
			expect(harness.syncRequestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			});
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_switched",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("disables create until the trimmed List name is valid", async () => {
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
			fireEvent.press(screen.getByRole("button", { name: "Create List" }));

			expect(
				screen.getByRole("button", { name: "Create" }).props.accessibilityState,
			).toEqual({ disabled: true });
			fireEvent.changeText(screen.getByLabelText("List name"), "   ");
			expect(
				screen.getByRole("button", { name: "Create" }).props.accessibilityState,
			).toEqual({ disabled: true });
			fireEvent.changeText(screen.getByLabelText("List name"), "A".repeat(81));
			expect(
				screen.getByText("List name must be 80 characters or fewer."),
			).toBeTruthy();
			expect(
				screen.getByRole("button", { name: "Create" }).props.accessibilityState,
			).toEqual({ disabled: true });
			fireEvent.changeText(screen.getByLabelText("List name"), "Camping");
			expect(
				screen.getByRole("button", { name: "Create" }).props.accessibilityState,
			).toEqual({ disabled: false });
		} finally {
			await harness.close();
		}
	});

	it("keeps the create sheet open with a generic error when valid submit fails", async () => {
		const harness = await createHomeSessionHarness({ failCreateList: true });

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			fireEvent.press(screen.getByLabelText("Current List, Groceries"));
			fireEvent.press(screen.getByRole("button", { name: "Create List" }));
			fireEvent.changeText(screen.getByLabelText("List name"), "Costco");
			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Create" }));
			});

			expect(screen.getByLabelText("List switcher")).toBeTruthy();
			expect(
				screen.getByText("Unable to create this List. Please try again."),
			).toBeTruthy();
			expect(screen.getByLabelText("List name").props.value).toBe("Costco");
			expect(harness.syncRequestSync).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("discards unsaved create drafts on cancel", async () => {
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
			fireEvent.press(screen.getByRole("button", { name: "Create List" }));
			fireEvent.changeText(screen.getByLabelText("List name"), "Camping");
			fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
			fireEvent.press(screen.getByRole("button", { name: "Create List" }));

			expect(screen.getByLabelText("List name").props.value).toBe("");
		} finally {
			await harness.close();
		}
	});

	it("ignores duplicate create submits while local create is in progress", async () => {
		const createGate = deferred<void>();
		const harness = await createHomeSessionHarness({
			createListGate: createGate.promise,
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
			fireEvent.press(screen.getByRole("button", { name: "Create List" }));
			fireEvent.changeText(screen.getByLabelText("List name"), "Costco");
			fireEvent.press(screen.getByRole("button", { name: "Create" }));
			await waitFor(() =>
				expect(
					screen.getByRole("button", { name: "Creating" }).props
						.accessibilityState,
				).toEqual({ disabled: true }),
			);
			fireEvent.press(screen.getByRole("button", { name: "Creating" }));

			expect(harness.createListCount()).toBe(1);
			await act(async () => {
				createGate.resolve();
				await createGate.promise;
			});
			await waitFor(() => expect(screen.getByText("Costco")).toBeTruthy());
		} finally {
			await harness.close();
		}
	});
});
