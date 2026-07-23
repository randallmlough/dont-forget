import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { Button } from "./button";

it("renders a text child as the accessible button label", async () => {
	const onPress = jest.fn();

	await render(<Button onPress={onPress}>Add Item</Button>);
	const button = screen.getByRole("button", { name: "Add Item" });

	fireEvent.press(button);

	expect(onPress).toHaveBeenCalledTimes(1);
	expect(button.props.accessibilityState).toEqual({
		busy: false,
		disabled: false,
	});
});

it("disables interaction and exposes busy state while loading", async () => {
	const onPress = jest.fn();

	await render(
		<Button loading onPress={onPress}>
			Save
		</Button>,
	);
	const button = screen.getByRole("button", { name: "Save" });

	fireEvent.press(button);

	expect(onPress).not.toHaveBeenCalled();
	expect(button.props.accessibilityState).toEqual({
		busy: true,
		disabled: true,
	});
});

it("preserves explicit accessibility state and custom content", async () => {
	await render(
		<Button
			accessibilityLabel="Add Item"
			accessibilityState={{ expanded: true }}
			onPress={jest.fn()}
			size="icon"
			variant="outline"
		>
			<Text>+</Text>
		</Button>,
	);
	const button = screen.getByRole("button", { name: "Add Item" });

	expect(screen.getByText("+")).toBeTruthy();
	expect(button.props.accessibilityState).toEqual({
		busy: false,
		disabled: false,
		expanded: true,
	});
});

it("keeps glass buttons on the existing pressable behavior", async () => {
	const onPress = jest.fn();

	await render(
		<Button onPress={onPress} variant="glass">
			Add Item
		</Button>,
	);
	const button = screen.getByRole("button", { name: "Add Item" });

	fireEvent.press(button);

	expect(onPress).toHaveBeenCalledTimes(1);
	expect(button.props.accessibilityState).toEqual({
		busy: false,
		disabled: false,
	});
});
