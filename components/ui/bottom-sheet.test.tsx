import { act, render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";

import { BottomSheet } from "./bottom-sheet";

it("renders children inside the sheet Modal while presented", async () => {
	const rendered = await render(
		<BottomSheet isPresented onIsPresentedChange={jest.fn()}>
			<View>
				<Text>Sheet content</Text>
			</View>
		</BottomSheet>,
	);

	expect(
		rendered.root?.queryAll((instance) => instance.type === "Modal", {
			includeSelf: true,
		}),
	).toHaveLength(1);
	expect(screen.getByText("Sheet content")).toBeTruthy();
});

it("renders nothing when not presented", async () => {
	const rendered = await render(
		<BottomSheet isPresented={false} onIsPresentedChange={jest.fn()}>
			<View>
				<Text>Sheet content</Text>
			</View>
		</BottomSheet>,
	);

	expect(screen.queryByText("Sheet content")).toBeNull();
	expect(
		rendered.root?.queryAll((instance) => instance.type === "Modal", {
			includeSelf: true,
		}) ?? [],
	).toHaveLength(0);
});

it("reports dismissal when the Modal's onRequestClose fires", async () => {
	const onIsPresentedChange = jest.fn();
	const rendered = await render(
		<BottomSheet isPresented onIsPresentedChange={onIsPresentedChange}>
			<View>
				<Text>Sheet content</Text>
			</View>
		</BottomSheet>,
	);

	// Native swipe-down dismissal fires the sheet Modal's onRequestClose.
	await act(() => {
		rendered.root
			?.queryAll((instance) => instance.type === "Modal", {
				includeSelf: true,
			})[0]
			?.props.onRequestClose();
	});

	expect(onIsPresentedChange).toHaveBeenCalledWith(false);
});
