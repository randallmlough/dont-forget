import { fireEvent, render, screen } from "@testing-library/react-native";
import { Pressable, Text, View } from "react-native";

import { BottomSheet } from "./bottom-sheet";

it("renders its header and content inside the Expo UI sheet", async () => {
	await render(
		<BottomSheet
			header={{
				title: "Add Item",
				trailingAction: (
					<Pressable accessibilityRole="button">
						<Text>Save</Text>
					</Pressable>
				),
			}}
			isPresented
			onIsPresentedChange={jest.fn()}
		>
			<Text>Sheet content</Text>
		</BottomSheet>,
	);

	expect(screen.getByRole("header", { name: "Add Item" })).toBeTruthy();
	expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
	expect(screen.getByText("Sheet content")).toBeTruthy();
});

it("renders nothing when not presented", async () => {
	await render(
		<BottomSheet isPresented={false} onIsPresentedChange={jest.fn()}>
			<Text>Sheet content</Text>
		</BottomSheet>,
	);

	expect(screen.queryByText("Sheet content")).toBeNull();
	expect(screen.queryByTestId("expo-bottom-sheet")).toBeNull();
});

it("reports native dismissal through the controlled presentation callback", async () => {
	const onIsPresentedChange = jest.fn();
	await render(
		<BottomSheet isPresented onIsPresentedChange={onIsPresentedChange}>
			<Text>Sheet content</Text>
		</BottomSheet>,
	);

	fireEvent.press(screen.getByRole("button", { name: "Dismiss bottom sheet" }));

	expect(onIsPresentedChange).toHaveBeenCalledWith(false);
});

it("forwards snap points and fills the bounded native host", async () => {
	await render(
		<BottomSheet
			isPresented
			onIsPresentedChange={jest.fn()}
			showDragIndicator={false}
			snapPoints={["half", "full"]}
			testID="list-sheet"
		>
			<View />
		</BottomSheet>,
	);

	expect(screen.getByTestId("list-sheet")).toHaveAccessibilityValue({
		text: JSON.stringify({
			showDragIndicator: false,
			snapPoints: ["half", "full"],
		}),
	});
	expect(screen.getByTestId("expo-rn-host-view")).toHaveAccessibilityValue({
		text: "fill",
	});
});

it("matches content height when no snap points are provided", async () => {
	await render(
		<BottomSheet isPresented onIsPresentedChange={jest.fn()}>
			<Text>Short content</Text>
		</BottomSheet>,
	);

	expect(screen.getByTestId("expo-rn-host-view")).toHaveAccessibilityValue({
		text: "match contents",
	});
});
