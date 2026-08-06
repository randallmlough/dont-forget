import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { ListSummary } from "@mobile/features/list/list-service";
import { HomeListPageControl } from "./home-list-toolbar";

/**
 * Home's List page control, in the states the size of a Household's Lists puts
 * it in. Its own toolbar is a `Stack.Toolbar`, which only exists inside a native
 * stack and hands its items to UIKit, so these stories stand the control on a
 * bar of their own instead. The scrub is live: drag across the dots.
 */
const meta = {
	title: "screens/app/HomeListPageControl",
	decorators: [
		(Story) => (
			<View style={styles.canvas}>
				<View style={styles.bar}>
					<Story />
				</View>
			</View>
		),
	],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const AFewLists: Story = {
	render: () => <PageControlStory listCount={3} initialIndex={0} />,
};

/** The most Lists the strip shows a dot for before it starts windowing them. */
export const EveryListShown: Story = {
	render: () => <PageControlStory listCount={10} initialIndex={4} />,
};

export const ThirtyListsAtTheStart: Story = {
	render: () => <PageControlStory listCount={30} initialIndex={0} />,
};

export const ThirtyListsMidRun: Story = {
	render: () => <PageControlStory listCount={30} initialIndex={14} />,
};

export const ThirtyListsAtTheEnd: Story = {
	render: () => <PageControlStory listCount={30} initialIndex={29} />,
};

function PageControlStory({
	listCount,
	initialIndex,
}: {
	listCount: number;
	initialIndex: number;
}) {
	const [focusedIndex, setFocusedIndex] = useState(initialIndex);

	return (
		<HomeListPageControl
			focusedIndex={focusedIndex}
			lists={storyListSummaries(listCount)}
			onCommitPage={setFocusedIndex}
			onScrubToPage={setFocusedIndex}
		/>
	);
}

function storyListSummaries(count: number): ListSummary[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `lst_story_${index + 1}`,
		householdId: "hh_story",
		name: index === 0 ? "Groceries" : `List ${index + 1}`,
		createdByUserId: "usr_avery",
		createdAt: index + 1,
		updatedAt: index + 1,
		archived: false,
		archivedAt: null,
		lastActivityAt: 100 - index,
		uncheckedItemCount: index + 1,
		checkedItemCount: index % 4,
	}));
}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.background,
	},
	bar: {
		flexDirection: "row",
		justifyContent: "center",
		paddingHorizontal: theme.spacing(4),
		borderRadius: theme.radii.full,
		backgroundColor: theme.colors.card,
	},
}));
