import { fireEvent, render, screen } from "@testing-library/react-native";
import type { PropsWithChildren, ReactElement } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { UnistylesRuntime } from "react-native-unistyles";
import { AddItemComposer } from "./add-item-composer";

describe("AddItemComposer", () => {
	it("passes dark appearance through the SwiftUI Host", async () => {
		(UnistylesRuntime as unknown as { themeName?: string }).themeName = "dark";

		await renderOpenComposer();

		expect(screen.getByTestId("expo-ui-host").props.accessibilityValue).toEqual(
			{
				text: "dark",
			},
		);
	});

	it("keeps the SwiftUI glass host fully opaque during entry", async () => {
		await renderOpenComposer();

		const animatedParent = screen.getByTestId("expo-ui-host").parent;
		if (!animatedParent) {
			throw new Error("Expected the SwiftUI Host to have an animated parent");
		}

		const animatedParentStyle = StyleSheet.flatten(animatedParent.props.style);

		expect(animatedParentStyle).not.toHaveProperty("opacity");
		expect(animatedParentStyle.transform).toEqual([{ translateY: 16 }]);
	});

	it("renders the rich details together and exposes an explicit Cancel action", async () => {
		const dismiss = jest.fn();

		await renderOpenComposer({ dismiss });

		expect(screen.getByText("New Item")).toBeOnTheScreen();
		expect(screen.getByText("ITEM NAME")).toBeOnTheScreen();
		expect(screen.getByLabelText("Item name")).toBeOnTheScreen();
		expect(screen.getByText("QUANTITY")).toBeOnTheScreen();
		expect(screen.getByLabelText("Quantity")).toBeOnTheScreen();
		expect(screen.getByText("LIST")).toBeOnTheScreen();
		expect(screen.getAllByText("Groceries")).not.toHaveLength(0);
		expect(screen.getByText("NOTE")).toBeOnTheScreen();
		expect(screen.getByLabelText("Item note")).toBeOnTheScreen();
		expect(screen.getByText("Press Return to add quickly")).toBeOnTheScreen();

		fireEvent.press(
			screen.getByRole("button", { name: "Cancel Item composer" }),
		);

		expect(dismiss).toHaveBeenCalledTimes(1);
	});

	it("selects a destination List without dismissing the composer", async () => {
		const dismiss = jest.fn();
		const changeList = jest.fn();

		await renderOpenComposer({ changeList, dismiss });

		fireEvent.press(
			screen.getByRole("menuitem", { name: "Select List: Costco" }),
		);

		expect(changeList).toHaveBeenCalledWith("lst_costco");
		expect(dismiss).not.toHaveBeenCalled();
	});

	it("submits from the native keyboard action", async () => {
		const submit = jest.fn();

		await renderOpenComposer({ submit });
		fireEvent(screen.getByLabelText("Item name"), "submitEditing");

		expect(submit).toHaveBeenCalledTimes(1);
	});
});

function renderOpenComposer({
	changeList = () => undefined,
	dismiss = () => undefined,
	submit = () => undefined,
}: {
	changeList?: (listId: string) => void;
	dismiss?: () => void;
	submit?: () => void;
} = {}) {
	return renderWithSafeArea(
		<AddItemComposer
			draft={{ name: "", notes: "", quantity: "" }}
			ui={{
				isOpen: true,
				canSubmit: false,
				selectedListId: "lst_groceries",
				listOptions: [
					{ id: "lst_groceries", name: "Groceries" },
					{ id: "lst_costco", name: "Costco" },
				],
				errorMessage: null,
			}}
			actions={{
				open() {},
				dismiss,
				changeList,
				submit,
				changeName() {},
				changeQuantity() {},
				changeNotes() {},
			}}
		/>,
	);
}

function renderWithSafeArea(element: ReactElement) {
	return render(element, {
		wrapper: ({ children }: PropsWithChildren) => (
			<SafeAreaProvider
				initialMetrics={{
					frame: { x: 0, y: 0, width: 390, height: 844 },
					insets: { top: 0, right: 0, bottom: 34, left: 0 },
				}}
			>
				{children}
			</SafeAreaProvider>
		),
	});
}
