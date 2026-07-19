import { render, screen, within } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import { SurfaceRow } from "./settings-surface";

it("exposes an interactive row and its trailing action as separate controls", async () => {
	await render(
		<SurfaceRow
			label="Pantry"
			onPress={jest.fn()}
			trailing={
				<Pressable
					accessibilityLabel="List actions for Pantry"
					accessibilityRole="button"
					onPress={jest.fn()}
				>
					<Text>Actions</Text>
				</Pressable>
			}
		/>,
	);

	const rowButton = screen.getByRole("button", { name: "Pantry" });

	expect(screen.getAllByRole("button")).toHaveLength(2);
	expect(
		screen.getByRole("button", { name: "List actions for Pantry" }),
	).toBeTruthy();
	expect(
		within(rowButton).queryByRole("button", {
			name: "List actions for Pantry",
		}),
	).toBeNull();
});
