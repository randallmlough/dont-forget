import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { deferred } from "@/lib/test/async";
import {
	createHomeSessionHarness,
	HomeScreenView,
	mockCurrentListSelectionStore,
	renderWithSafeArea,
	resetHomeTestMocks,
} from "@/lib/test/home-screen-test-support";
import { analyticsMocks } from "@/lib/test/mocks/analytics";

describe("Home Current List session races", () => {
	beforeEach(resetHomeTestMocks);

	it("remounts Active List when the session resource changes", async () => {
		const firstHarness = await createHomeSessionHarness({
			uncheckedItemName: "Cached Milk",
			resourceKey: "authenticated-app-session:1",
		});
		const secondHarness = await createHomeSessionHarness({
			uncheckedItemName: "Fresh Eggs",
			resourceKey: "authenticated-app-session:2",
		});

		try {
			const { rerender } = renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={firstHarness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Cached Milk")).toBeTruthy());
			rerender(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={secondHarness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Fresh Eggs")).toBeTruthy());
			expect(screen.queryByText("Cached Milk")).toBeNull();
		} finally {
			await firstHarness.close();
			await secondHarness.close();
		}
	});

	it("ignores stale List loads after the session resource changes", async () => {
		const staleListRead = deferred<void>();
		const freshListRead = deferred<void>();
		const staleHarness = await createHomeSessionHarness({
			listName: "Stale",
			resourceKey: "authenticated-app-session:1",
			listReadGate: staleListRead.promise,
		});
		const freshHarness = await createHomeSessionHarness({
			uncheckedItemName: "Fresh Eggs",
			resourceKey: "authenticated-app-session:2",
			listReadGate: freshListRead.promise,
		});

		try {
			const { rerender } = renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={staleHarness.session}
				/>,
			);

			rerender(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={freshHarness.session}
				/>,
			);

			await act(async () => {
				freshListRead.resolve();
				await freshListRead.promise;
			});
			await waitFor(() => expect(screen.getByText("Fresh Eggs")).toBeTruthy());

			await act(async () => {
				staleListRead.resolve();
				await staleListRead.promise;
			});
			expect(screen.queryByText("Stale")).toBeNull();
			expect(screen.getByText("Fresh Eggs")).toBeTruthy();
		} finally {
			await staleHarness.close();
			await freshHarness.close();
		}
	});

	it("ignores an in-flight List switch after the session resource changes", async () => {
		const staleSwitchRead = deferred<void>();
		const staleHarness = await createHomeSessionHarness({
			includeWeekendList: true,
			resourceKey: "authenticated-app-session:1",
			listReadGatesByListId: {
				lst_weekend: staleSwitchRead.promise,
			},
		});
		const freshHarness = await createHomeSessionHarness({
			uncheckedItemName: "Fresh Eggs",
			resourceKey: "authenticated-app-session:2",
		});

		try {
			const { rerender } = renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={staleHarness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			fireEvent.press(screen.getByLabelText("Current List, Groceries"));
			fireEvent.press(
				screen.getByRole("button", { name: /Weekend, \d+ unchecked/ }),
			);

			rerender(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={freshHarness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Fresh Eggs")).toBeTruthy());

			await act(async () => {
				staleSwitchRead.resolve();
				await staleSwitchRead.promise;
			});

			expect(
				mockCurrentListSelectionStore.writeSelection,
			).not.toHaveBeenCalled();
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_switched",
				expect.anything(),
			);
			expect(screen.getByText("Fresh Eggs")).toBeTruthy();
			expect(screen.queryByText("Weekend")).toBeNull();
		} finally {
			await staleHarness.close();
			await freshHarness.close();
		}
	});
});
