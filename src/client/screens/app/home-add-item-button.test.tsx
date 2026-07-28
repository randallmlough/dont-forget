import { act, render, screen, waitFor } from "@testing-library/react-native";
import {
	Keyboard,
	type KeyboardEvent,
	type KeyboardEventName,
} from "react-native";
import { TestSafeAreaProvider } from "@/test/safe-area";
import { HomeAddItemButton } from "./home-add-item-button";

it("rotates only the plus symbol when editing", async () => {
	const view = await render(
		<HomeAddItemButton
			editorActive={false}
			finishing={false}
			onAddItem={jest.fn()}
			onFinishEditing={jest.fn()}
		/>,
		{ wrapper: TestSafeAreaProvider },
	);

	expect(screen.getByText("plus", { includeHiddenElements: true })).toHaveStyle(
		{
			transform: [{ rotate: "0deg" }],
		},
	);
	expect(screen.getByTestId("expo-ui-host").props.style).toBeUndefined();

	await view.rerender(
		<HomeAddItemButton
			editorActive
			finishing={false}
			onAddItem={jest.fn()}
			onFinishEditing={jest.fn()}
		/>,
	);

	expect(screen.getByText("plus", { includeHiddenElements: true })).toHaveStyle(
		{
			transform: [{ rotate: "45deg" }],
		},
	);
	expect(screen.getByTestId("expo-ui-host").props.style).toBeUndefined();

	await view.rerender(
		<HomeAddItemButton
			editorActive={false}
			finishing
			onAddItem={jest.fn()}
			onFinishEditing={jest.fn()}
		/>,
	);

	expect(screen.getByText("plus", { includeHiddenElements: true })).toHaveStyle(
		{
			transform: [{ rotate: "0deg" }],
		},
	);
	expect(screen.getByRole("button", { name: "Add Item" })).toBeDisabled();
	expect(screen.getByTestId("expo-ui-host").props.style).toBeUndefined();
});

it("keeps the finish control above the keyboard", async () => {
	let keyboardWillShow: ((event: KeyboardEvent) => unknown) | undefined;
	const addListener = Keyboard.addListener.bind(Keyboard);
	const addListenerSpy = jest
		.spyOn(Keyboard, "addListener")
		.mockImplementation(
			(
				eventType: KeyboardEventName,
				listener: (event: KeyboardEvent) => unknown,
			) => {
				if (eventType === "keyboardWillShow") keyboardWillShow = listener;
				return addListener(eventType, listener);
			},
		);

	try {
		await render(
			<HomeAddItemButton
				editorActive
				finishing={false}
				onAddItem={jest.fn()}
				onFinishEditing={jest.fn()}
			/>,
			{ wrapper: TestSafeAreaProvider },
		);

		const keyboardLayer = screen.getByTestId(
			"home-add-item-button-keyboard-layer",
		);
		await act(async () => {
			await keyboardLayer.props.onLayout({
				persist: jest.fn(),
				nativeEvent: {
					layout: { x: 0, y: 0, width: 390, height: 844 },
				},
			});
		});

		expect(keyboardWillShow).toBeDefined();
		await act(async () => {
			keyboardWillShow?.({
				duration: 250,
				easing: "keyboard",
				endCoordinates: {
					screenX: 0,
					screenY: 508,
					width: 390,
					height: 336,
				},
			});
		});

		await waitFor(() => {
			expect(keyboardLayer).toHaveStyle({ flex: 0, height: 588 });
		});
		expect(screen.getByTestId("home-add-item-button-position")).toHaveStyle({
			bottom: 88,
		});
		// 588-point layer height - 88-point bottom offset = 500, leaving
		// eight points before the keyboard starts at screenY 508.
		expect(
			screen.getByRole("button", { name: "Finish editing Item" }),
		).toBeTruthy();
	} finally {
		addListenerSpy.mockRestore();
	}
});
