import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { ButtonNative } from "./button-native";

it("renders a native button with the current text interaction", async () => {
	const onPress = jest.fn();

	await render(<ButtonNative onPress={onPress}>Add Item</ButtonNative>);
	const button = screen.getByRole("button", { name: "Add Item" });

	fireEvent.press(button);

	expect(onPress).toHaveBeenCalledTimes(1);
	expect(button.props.accessibilityState).toEqual({ disabled: false });
});

it("disables native interaction and exposes a busy value while loading", async () => {
	const onPress = jest.fn();

	await render(
		<ButtonNative loading onPress={onPress}>
			Save
		</ButtonNative>,
	);
	const button = screen.getByRole("button", { name: "Save" });

	fireEvent.press(button);

	expect(onPress).not.toHaveBeenCalled();
	expect(button.props.accessibilityState).toEqual({ disabled: true });
	expect(button.props.accessibilityValue).toEqual({ text: "Busy" });
});

it("hosts custom React Native content inside the native label", async () => {
	await render(
		<ButtonNative accessibilityLabel="Add Item" onPress={jest.fn()}>
			<Text>+</Text>
		</ButtonNative>,
	);

	expect(screen.getByRole("button", { name: "Add Item" })).toBeTruthy();
	expect(screen.getByText("+")).toBeTruthy();
});
