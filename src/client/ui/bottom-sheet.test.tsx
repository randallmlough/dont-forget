import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
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

it("keeps the native host mounted while not presented", async () => {
	await render(
		<BottomSheet isPresented={false} onIsPresentedChange={jest.fn()}>
			<Text>Sheet content</Text>
		</BottomSheet>,
	);

	expect(screen.queryByText("Sheet content")).toBeNull();
	expect(screen.getByTestId("expo-ui-host")).toBeTruthy();
});

it("retains the latest presented content until native dismissal completes", async () => {
	const onIsPresentedChange = jest.fn();
	const onDismiss = jest.fn();
	const events: string[] = [];
	await render(
		<ControlledSheet
			onDismiss={() => {
				events.push("dismissed");
				onDismiss();
			}}
			onIsPresentedChange={(presented) => {
				events.push(`presented:${presented}`);
				onIsPresentedChange(presented);
			}}
		/>,
	);

	await fireEvent.press(
		screen.getByRole("button", { name: "Update sheet content" }),
	);
	expect(screen.getByText("Latest content")).toBeTruthy();

	await fireEvent.press(
		screen.getByRole("button", { name: "Dismiss bottom sheet" }),
	);

	expect(onIsPresentedChange).toHaveBeenCalledWith(false);
	expect(onDismiss).not.toHaveBeenCalled();
	expect(screen.getByText("Latest content")).toBeTruthy();
	expect(screen.queryByText("Original content")).toBeNull();

	await fireEvent.press(
		screen.getByRole("button", { name: "Complete bottom sheet dismissal" }),
	);

	expect(onDismiss).toHaveBeenCalledTimes(1);
	expect(screen.queryByText("Latest content")).toBeNull();
	expect(events).toEqual(["presented:false", "dismissed"]);
});

it("maps snap points to native detents and fills the bounded host", async () => {
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
			fitToContents: false,
			isPresented: true,
			interactiveDismissDisabled: false,
		}),
	});
	expect(screen.getByTestId("expo-rn-host-view")).toHaveAccessibilityValue({
		text: "fill",
	});
	expect(sheetModifiers()).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				$type: "presentationDragIndicator",
				visibility: "hidden",
			}),
			expect.objectContaining({
				$type: "presentationDetents",
				detents: ["medium", "large"],
			}),
		]),
	);
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
	expect(screen.getByTestId("expo-bottom-sheet")).toHaveAccessibilityValue({
		text: JSON.stringify({
			fitToContents: true,
			isPresented: true,
			interactiveDismissDisabled: false,
		}),
	});
});

it("disables native interactive dismissal when requested", async () => {
	const onIsPresentedChange = jest.fn();
	await render(
		<BottomSheet
			interactiveDismissDisabled
			isPresented
			onIsPresentedChange={onIsPresentedChange}
		>
			<Text>Saving content</Text>
		</BottomSheet>,
	);

	const dismissButton = screen.getByRole("button", {
		name: "Dismiss bottom sheet",
	});
	expect(dismissButton).toBeDisabled();
	await fireEvent.press(dismissButton);

	expect(onIsPresentedChange).not.toHaveBeenCalled();
	expect(sheetModifiers()).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				$type: "interactiveDismissDisabled",
				isDisabled: true,
			}),
		]),
	);
});

function ControlledSheet({
	onDismiss,
	onIsPresentedChange,
}: {
	onDismiss: () => void;
	onIsPresentedChange: (isPresented: boolean) => void;
}) {
	const [content, setContent] = useState("Original content");
	const [isPresented, setIsPresented] = useState(true);

	return (
		<>
			<Pressable
				accessibilityRole="button"
				onPress={() => setContent("Latest content")}
			>
				<Text>Update sheet content</Text>
			</Pressable>
			<BottomSheet
				isPresented={isPresented}
				onDismiss={onDismiss}
				onIsPresentedChange={(presented) => {
					onIsPresentedChange(presented);
					setIsPresented(presented);
				}}
			>
				{isPresented ? <Text>{content}</Text> : null}
			</BottomSheet>
		</>
	);
}

function sheetModifiers(): object[] {
	const serialized = screen.getByTestId("expo-bottom-sheet-group").props
		.accessibilityValue?.text;
	if (typeof serialized !== "string") {
		throw new Error("Expected mocked sheet modifiers");
	}
	return JSON.parse(serialized);
}
