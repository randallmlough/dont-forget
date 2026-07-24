import type { Meta, StoryObj } from "@storybook/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationDrawerProvider } from "@/client/app-shell/navigation-drawer-context";
import type { ListSummary } from "@/client/features/list/list-service";
import { ListsScreenView } from "./lists-screen";

const meta = {
	title: "screens/app/ListsScreen",
	component: ListsScreenView,
	parameters: { noSafeArea: true },
	decorators: [
		(Story) => (
			<SafeAreaProvider
				initialMetrics={{
					frame: { x: 0, y: 0, width: 390, height: 844 },
					insets: { top: 47, left: 0, right: 0, bottom: 34 },
				}}
			>
				<NavigationDrawerProvider open={noop}>
					<Story />
				</NavigationDrawerProvider>
			</SafeAreaProvider>
		),
	],
	args: {
		session: sessionFixture(),
		rows: { status: "ready", summaries: listSummaries() },
		currentListId: "lst_story_1",
		onSelectList: async () => undefined,
		onCreateList: handled,
		onRenameList: handled,
		onDeleteList: handled,
	},
} satisfies Meta<typeof ListsScreenView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Rows: Story = {};

export const NoCurrentList: Story = {
	args: { currentListId: null },
};

export const Empty: Story = {
	args: { rows: { status: "ready", summaries: [] }, currentListId: null },
};

export const Loading: Story = {
	args: { rows: { status: "loading" } },
};

export const ErrorState: Story = {
	args: { rows: { status: "error" } },
};

function listSummaries(): ListSummary[] {
	return Array.from({ length: 14 }, (_, index) => ({
		id: `lst_story_${index + 1}`,
		householdId: "hh_story",
		name:
			index === 0
				? "The Home Depot"
				: index === 1
					? "Groceries and household essentials for the weekend"
					: `List ${index + 1}`,
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

function sessionFixture() {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
			firstName: "Avery",
			lastName: "Chen",
		},
		activeHousehold: { id: "hh_story", name: "Golden Pantry" },
		households: [
			{
				id: "hh_story",
				name: "Golden Pantry",
				role: "owner" as const,
				isActive: true,
			},
		],
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner" as const,
			displayName: "Avery Chen",
		},
		members: [],
	};
}

async function handled() {
	return { status: "handled" as const };
}

function noop() {}
