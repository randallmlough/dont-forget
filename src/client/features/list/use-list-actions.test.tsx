import {
	act,
	renderHook,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { toast } from "@/client/ui/toast";
import { drainToasts, ToastHarness } from "@/test/toast";
import { populatedActiveListState } from "./list-test-support";
import { useListActions } from "./use-list-actions";

describe("useListActions", () => {
	afterEach(drainToasts);

	it("ignores empty Item names", async () => {
		const onAddItem = jest.fn(async () => undefined);
		const { result } = await renderUseListActions({ onAddItem });

		await act(async () => {
			await result.current.addItem({
				listId: "lst_groceries",
				name: "   ",
				quantity: "",
				notes: "",
			});
		});

		expect(onAddItem).not.toHaveBeenCalled();
	});

	it("trims Item name, quantity, and notes before adding", async () => {
		const onAddItem = jest.fn(async () => undefined);
		const { result } = await renderUseListActions({ onAddItem });

		await act(async () => {
			await result.current.addItem({
				listId: "lst_groceries",
				name: " Milk ",
				quantity: " 1 gallon ",
				notes: " Organic ",
			});
		});

		expect(onAddItem).toHaveBeenCalledWith({
			listId: "lst_groceries",
			name: "Milk",
			quantity: "1 gallon",
			notes: "Organic",
		});
	});

	it("normalizes blank quantity and notes to null", async () => {
		const onAddItem = jest.fn(async () => undefined);
		const { result } = await renderUseListActions({ onAddItem });

		await act(async () => {
			await result.current.addItem({
				listId: "lst_groceries",
				name: "Milk",
				quantity: " ",
				notes: "",
			});
		});

		expect(onAddItem).toHaveBeenCalledWith({
			listId: "lst_groceries",
			name: "Milk",
			quantity: null,
			notes: null,
		});
	});

	it("reports the add failure and rethrows", async () => {
		const failure = new Error("write failed");
		const onAddItem = jest.fn(async () => {
			throw failure;
		});
		const { result } = await renderUseListActions({ onAddItem });
		let caught: unknown;

		await act(async () => {
			try {
				await result.current.addItem({
					listId: "lst_groceries",
					name: "Milk",
					quantity: "",
					notes: "",
				});
			} catch (error) {
				caught = error;
			}
		});

		expect(caught).toBe(failure);
		expect(
			await screen.findByText("Unable to save that Item. Please try again."),
		).toBeTruthy();
	});

	it("reports the toggle failure without throwing", async () => {
		const onSetItemChecked = jest.fn(async () => {
			throw new Error("write failed");
		});
		const { result } = await renderUseListActions({ onSetItemChecked });

		await act(async () => {
			await result.current.toggleItem("item-1");
		});

		expect(onSetItemChecked).toHaveBeenCalledWith("item-1", true);
		expect(
			await screen.findByText("Unable to save that change. Please try again."),
		).toBeTruthy();
	});

	it("reports nothing when a retry succeeds", async () => {
		const onAddItem = jest
			.fn()
			.mockRejectedValueOnce(new Error("write failed"))
			.mockResolvedValueOnce(undefined);
		const { result } = await renderUseListActions({ onAddItem });
		let caught: unknown;

		await act(async () => {
			try {
				await result.current.addItem({
					listId: "lst_groceries",
					name: "Milk",
					quantity: "",
					notes: "",
				});
			} catch (error) {
				caught = error;
			}
		});

		expect(caught).toEqual(new Error("write failed"));
		expect(
			await screen.findByText("Unable to save that Item. Please try again."),
		).toBeTruthy();

		await act(() => toast.dismiss());
		await waitFor(() => {
			expect(
				screen.queryByText("Unable to save that Item. Please try again."),
			).toBeNull();
		});

		await act(async () => {
			await result.current.addItem({
				listId: "lst_groceries",
				name: "Eggs",
				quantity: "",
				notes: "",
			});
		});

		expect(
			screen.queryByText("Unable to save that Item. Please try again."),
		).toBeNull();
	});

	it("ignores unknown Item IDs when toggling", async () => {
		const onSetItemChecked = jest.fn(async () => undefined);
		const { result } = await renderUseListActions({ onSetItemChecked });

		await act(async () => {
			await result.current.toggleItem("missing-item");
		});

		expect(onSetItemChecked).not.toHaveBeenCalled();
	});
});

function renderUseListActions(
	options: {
		onAddItem?: Parameters<typeof useListActions>[0]["onAddItem"];
		onSetItemChecked?: Parameters<typeof useListActions>[0]["onSetItemChecked"];
	} = {},
) {
	return renderHook(
		() =>
			useListActions({
				items: populatedActiveListState.items,
				onAddItem: options.onAddItem ?? jest.fn(async () => undefined),
				onSetItemChecked:
					options.onSetItemChecked ?? jest.fn(async () => undefined),
			}),
		{ wrapper: ToastHarness },
	);
}
