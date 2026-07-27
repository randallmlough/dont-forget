import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { BottomSheetStory } from "./bottom-sheet.stories";

it("renders the interactive story shell without raw text children", async () => {
	await render(
		<BottomSheetStory snapPoints={["half"]} title="Example sheet">
			<Text>Sheet content</Text>
		</BottomSheetStory>,
	);

	expect(
		screen.getByRole("button", { name: "Open Example sheet" }),
	).toBeTruthy();
});
