import { render, screen } from "@testing-library/react-native";
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
});

function renderOpenComposer() {
	return renderWithSafeArea(
		<AddItemComposer
			draft={{ name: "", notes: "", quantity: "" }}
			ui={{
				isOpen: true,
				isNoteOpen: false,
				canSubmit: false,
				listName: "Groceries",
				errorMessage: null,
			}}
			actions={{
				open() {},
				dismiss() {},
				submit() {},
				changeName() {},
				changeQuantity() {},
				changeNotes() {},
				toggleNote() {},
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
