import type { Meta, StoryObj } from "@storybook/react-native";
import { useMemo } from "react";
import { View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { CurrentList, type HomeCurrentListDeps } from "./current-list";
import { authenticatedAppSession } from "./list-test-support";

/**
 * These stories cover the Home states CurrentList resolves before it mounts the
 * List pager. The pager itself is not story-driven: every List page watches its
 * own Items through PowerSync, so page content needs the app runtime. `List
 * Parts` covers Item rendering with fixtures.
 */
const meta = {
	title: "Features/List/CurrentList",
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
		<CurrentListStory
			deps={{
				currentList: {
					state: { status: "loading" },
					retry: noop,
					reload: noop,
				},
				syncState: "synced",
				listRows: { status: "loading" },
			}}
		/>
	),
};

export const Unavailable: Story = {
	render: () => (
		<CurrentListStory
			deps={{
				currentList: {
					state: {
						status: "error",
						message: "Unable to load this List. Please try again.",
					},
					retry: noop,
					reload: noop,
				},
				syncState: "failed",
				listRows: { status: "error" },
			}}
		/>
	),
};

export const ZeroActive: Story = {
	render: () => (
		<CurrentListStory
			deps={{
				currentList: {
					state: { status: "zeroActive" },
					retry: noop,
					reload: noop,
				},
				syncState: "synced",
				listRows: { status: "ready", summaries: [] },
			}}
		/>
	),
};

function CurrentListStory({ deps }: { deps: HomeCurrentListDeps }) {
	const offsetY = useSharedValue(0);
	const largeTitleHeight = useSharedValue(0);
	const pagerDrift = useSharedValue(0);
	const collapsedTitleScroll = useMemo(
		() => ({ offsetY, largeTitleHeight, pagerDrift }),
		[offsetY, largeTitleHeight, pagerDrift],
	);

	return (
		<CurrentList
			session={authenticatedAppSession}
			composerOpen={false}
			deps={deps}
			focusedListId={null}
			collapsedTitleScroll={collapsedTitleScroll}
			pickerPhase="closed"
			selectionPending={false}
			onComposerOpenChange={noop}
			onFocusList={focusList}
			onOpenLists={noop}
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
