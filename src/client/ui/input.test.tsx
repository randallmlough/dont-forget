import { fireEvent, render, screen } from "@testing-library/react-native";

import { Input } from "./input";

it("renders secure entry as a secure field that accepts typing", async () => {
	const onTextChange = jest.fn();

	await render(
		<Input
			accessibilityLabel="Passphrase"
			onTextChange={onTextChange}
			secureTextEntry
		/>,
	);
	const field = screen.getByLabelText("Passphrase");

	fireEvent.changeText(field, "correct horse");

	expect(field.props.secureTextEntry).toBe(true);
	expect(onTextChange).toHaveBeenCalledWith("correct horse");
});

it("exposes the secure placeholder slot to placeholder queries", async () => {
	await render(
		<Input
			accessibilityLabel="Passphrase"
			placeholder="Required to join"
			secureTextEntry
		/>,
	);

	expect(screen.getByPlaceholderText("Required to join")).toBeTruthy();
});

it("exposes a plain input's placeholder slot the same way", async () => {
	await render(
		<Input accessibilityLabel="Item name" placeholder="Whole milk" />,
	);

	expect(screen.getByPlaceholderText("Whole milk")).toBeTruthy();
});
