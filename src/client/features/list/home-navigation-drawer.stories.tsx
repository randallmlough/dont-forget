import type { Meta, StoryObj } from "@storybook/react-native";
import { HomeNavigationDrawer } from "./home-navigation-drawer";

const meta = {
	title: "Home/HomeNavigationDrawer",
	component: HomeNavigationDrawer,
	args: {
		isOpen: true,
		memberName: "Avery Chen",
		householdName: "Juniper House",
		onClose: noop,
		onOpenAllLists: noop,
		onOpenHousehold: noop,
		onOpenSettings: noop,
		onSwitchHousehold: noop,
	},
} satisfies Meta<typeof HomeNavigationDrawer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {};

function noop() {}
