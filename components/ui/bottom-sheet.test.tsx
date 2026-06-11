import { act, render, screen } from "@testing-library/react-native";
import { Modal, Text, View } from "react-native";

import { BottomSheet } from "./bottom-sheet";

it("renders children inside the sheet Modal while presented", () => {
	render(
		<BottomSheet isPresented onIsPresentedChange={jest.fn()}>
			<View>
				<Text>Sheet content</Text>
			</View>
		</BottomSheet>,
	);

	expect(screen.UNSAFE_getByType(Modal)).toBeTruthy();
	expect(screen.getByText("Sheet content")).toBeTruthy();
});

it("renders nothing when not presented", () => {
	render(
		<BottomSheet isPresented={false} onIsPresentedChange={jest.fn()}>
			<View>
				<Text>Sheet content</Text>
			</View>
		</BottomSheet>,
	);

	expect(screen.queryByText("Sheet content")).toBeNull();
	expect(screen.UNSAFE_queryByType(Modal)).toBeNull();
});

it("reports dismissal when the Modal's onRequestClose fires", () => {
	const onIsPresentedChange = jest.fn();
	render(
		<BottomSheet isPresented onIsPresentedChange={onIsPresentedChange}>
			<View>
				<Text>Sheet content</Text>
			</View>
		</BottomSheet>,
	);

	// Native swipe-down dismissal fires the sheet Modal's onRequestClose.
	act(() => {
		screen.UNSAFE_getByType(Modal).props.onRequestClose();
	});

	expect(onIsPresentedChange).toHaveBeenCalledWith(false);
});
