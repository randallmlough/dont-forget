import type { Meta, StoryObj } from "@storybook/react-native";
import { useMemo } from "react";
import { View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { authenticatedAppSession } from "@/client/features/list/list-test-support";
import { HomeListPager, type HomeListPagerProps } from "./home-list-pager";

/**
 * These stories cover the Home states HomeListPager resolves before it mounts the
 * List pager. The pager itself is not story-driven: every List page watches its
 * own Items through PowerSync, so page content needs the app runtime. `List
 * Parts` covers Item rendering with fixtures.
 */
const meta = {
	title: "screens/app/HomeListPager",
	decorators: [
		(Story) => (
			<View style={styles.canvas}>
				<Story />
			</View>
		),
	],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loading: Story = {
	render: () => (
		<HomeListPagerStory
			data={{
				collectionState: { status: "loading" },
				syncState: "synced",
			}}
		/>
	),
};

export const Unavailable: Story = {
	render: () => (
		<HomeListPagerStory
			data={{
				collectionState: {
					status: "error",
					message: "Unable to load your Lists. Please try again.",
				},
				syncState: "failed",
			}}
		/>
	),
};

export const ZeroActive: Story = {
	render: () => (
		<HomeListPagerStory
			data={{
				collectionState: { status: "zeroActive" },
				syncState: "synced",
			}}
		/>
	),
};

type HomeListPagerData = Pick<
	HomeListPagerProps,
	"collectionState" | "syncState"
>;

function HomeListPagerStory({ data }: { data: HomeListPagerData }) {
	const offsetY = useSharedValue(0);
	const largeTitleHeight = useSharedValue(0);
	const pagerDrift = useSharedValue(0);
	const collapsedTitleScroll = useMemo(
		() => ({ offsetY, largeTitleHeight, pagerDrift }),
		[offsetY, largeTitleHeight, pagerDrift],
	);

	return (
		<HomeListPager
			{...data}
			session={authenticatedAppSession}
			composerOpen={false}
			focusedListId={null}
			collapsedTitleScroll={collapsedTitleScroll}
			pickerPhase="closed"
			selectionPending={false}
			onComposerOpenChange={noop}
			onFocusList={focusList}
			onOpenLists={noop}
			onRetry={noop}
			onPickerPhaseChange={noop}
		/>
	);
}

function noop() {}
async function focusList() {
	return true;
}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));
