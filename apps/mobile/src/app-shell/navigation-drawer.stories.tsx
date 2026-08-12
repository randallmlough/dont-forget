import { Button } from "@mobile/ui/button";
import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import {
	NavigationDrawerView,
	type NavigationDrawerViewProps,
} from "./navigation-drawer";

const meta = {
	title: "Components/AppShell/NavigationDrawer",
	component: NavigationDrawerView,
	excludeStories: ["NavigationDrawerStory"],
	argTypes: {
		isOpen: { control: false },
	},
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
	render: (args) => <NavigationDrawerStory {...args} />,
} satisfies Meta<typeof NavigationDrawerView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const HomeSelected: Story = {};

export const SettingsSelected: Story = {
	args: { pathname: "/settings" },
};

export function NavigationDrawerStory({
	isOpen: initiallyOpen,
	onClose,
	...props
}: NavigationDrawerViewProps) {
	const [isOpen, setIsOpen] = useState(initiallyOpen);

	return (
		<View style={styles.canvas}>
			<Button onPress={() => setIsOpen(true)}>Open navigation</Button>
			<NavigationDrawerView
				{...props}
				isOpen={isOpen}
				onClose={() => {
					onClose();
					setIsOpen(false);
				}}
			/>
		</View>
	);
}

function noop() {}

function noopNavigate(
	_destination: Parameters<NavigationDrawerViewProps["onNavigate"]>[0],
) {}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: theme.spacing(4),
	},
}));
