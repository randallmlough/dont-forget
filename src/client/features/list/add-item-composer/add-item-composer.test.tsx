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
		expect(screen.getByText("CURRENT LIST")).toBeOnTheScreen();
		expect(screen.getByText("Groceries")).toBeOnTheScreen();
		expect(screen.getByText("NOTE")).toBeOnTheScreen();
		expect(screen.getByLabelText("Item note")).toBeOnTheScreen();
		expect(screen.getByText("Press Return to add quickly")).toBeOnTheScreen();

		fireEvent.press(
			screen.getByRole("button", { name: "Cancel Item composer" }),
		);

		expect(dismiss).toHaveBeenCalledTimes(1);
	});

	it("dismisses before opening the existing Lists destination", async () => {
		const dismiss = jest.fn();
		const openLists = jest.fn();

		await renderOpenComposer({ dismiss, openLists });

		fireEvent.press(
			screen.getByRole("button", {
				name: "Current List: Groceries. Open Lists",
			}),
		);

		expect(dismiss).toHaveBeenCalledTimes(1);
		expect(openLists).toHaveBeenCalledTimes(1);
	});

	it("submits from the native keyboard action", async () => {
		const submit = jest.fn();

		await renderOpenComposer({ submit });
		fireEvent(screen.getByLabelText("Item name"), "submitEditing");

		expect(submit).toHaveBeenCalledTimes(1);
	});
});

function renderOpenComposer({
	dismiss = () => undefined,
	openLists,
	submit = () => undefined,
}: {
	dismiss?: () => void;
	openLists?: () => void;
	submit?: () => void;
} = {}) {
	return renderWithSafeArea(
		<AddItemComposer
			draft={{ name: "", notes: "", quantity: "" }}
			ui={{
				isOpen: true,
				canSubmit: false,
				listName: "Groceries",
				errorMessage: null,
			}}
			actions={{
				open() {},
				dismiss,
				openLists,
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
