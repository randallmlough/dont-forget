import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import type { ActiveListState } from "@/client/features/list/active-list";
import {
	emptyActiveListState,
	populatedActiveListState,
} from "@/client/features/list/active-list/test-support";
import { HomeScreenView } from "@/client/features/list/home-screen";
import type { AuthenticatedAppSession } from "@/client/session";

const meta = {
	title: "Home/HomeScreen",
	component: HomeScreenView,
	parameters: {
		noSafeArea: true,
	},
	decorators: [
		(Story) => (
			<View style={styles.canvas}>
				<Story />
			</View>
		),
	],
} satisfies Meta<typeof HomeScreenView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const EmptyList: Story = {
	args: {
		state: { status: "ready", refreshing: false },
		session: readySession(emptyActiveListState),
		onOpenSettings: noop,
	},
};

export const WithItems: Story = {
	args: {
		state: { status: "ready", refreshing: false },
		session: readySession(populatedActiveListState),
		onOpenSettings: noop,
	},
};

export const Loading: Story = {
	args: {
		state: { status: "loading" },
		session: null,
		onOpenSettings: noop,
	},
};

export const AuthenticatedAppSessionError: Story = {
	args: {
		state: {
			status: "error",
			message: "Unable to prepare your Household. Please try again.",
		},
		session: null,
		onRetry: noop,
		onOpenSettings: noop,
	},
};

function noop() {}

function readySession(initialList: ActiveListState): AuthenticatedAppSession {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
			firstName: "Avery",
			lastName: "Chen",
		},
		activeHousehold: { id: "hh_story", name: initialList.householdName },
		households: [
			{
				id: "hh_story",
				name: initialList.householdName,
				role: "owner",
				isActive: true,
			},
		],
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner",
			displayName: "Avery Chen",
		},
		members: [
			{
				membershipId: "mbr_avery",
				userId: "usr_avery",
				role: "owner" as const,
				displayName: "Avery Chen",
			},
		],
	};
}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));
