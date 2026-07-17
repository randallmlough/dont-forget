import { render, screen } from "@testing-library/react-native";
import type { PropsWithChildren, ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { UnistylesRuntime } from "react-native-unistyles";
import { AddItemComposer } from "./add-item-composer";

describe("AddItemComposer", () => {
	it("passes dark appearance through the SwiftUI Host", async () => {
		(UnistylesRuntime as unknown as { themeName?: string }).themeName = "dark";

		await renderWithSafeArea(
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

		expect(screen.getByTestId("expo-ui-host").props.accessibilityValue).toEqual(
			{
				text: "dark",
			},
		);
	});
});

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
