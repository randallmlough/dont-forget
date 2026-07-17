import type { Meta, StoryObj } from "@storybook/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
	NavigationDrawerView,
	type NavigationDrawerViewProps,
} from "./navigation-drawer";

const meta = {
	title: "AppShell/NavigationDrawer",
	component: NavigationDrawerView,
	decorators: [
		(Story) => (
			<SafeAreaProvider
				initialMetrics={{
					frame: { x: 0, y: 0, width: 390, height: 844 },
					insets: { top: 47, left: 0, right: 0, bottom: 34 },
				}}
			>
				<Story />
			</SafeAreaProvider>
		),
	],
	args: {
		isOpen: true,
		memberName: "Avery Chen",
		householdName: "Juniper House",
		pathname: "/",
		onClose: noop,
		onDismissed: noop,
		onNavigate: noopNavigate,
	},
} satisfies Meta<typeof NavigationDrawerView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const HomeSelected: Story = {};

export const SettingsSelected: Story = {
	args: { pathname: "/settings" },
};

function noop() {}

function noopNavigate(
	_destination: Parameters<NavigationDrawerViewProps["onNavigate"]>[0],
) {}
