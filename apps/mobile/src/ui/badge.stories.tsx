import type { Meta, StoryObj } from "@storybook/react-native";
import { Text, View } from "react-native";
import { ScopedTheme, StyleSheet } from "react-native-unistyles";

import { Badge, type BadgeVariant } from "./badge";

const variants = [
	"default",
	"secondary",
	"destructive",
	"outline",
] satisfies BadgeVariant[];

const meta = {
	title: "UI/Badge",
	component: Badge,
	args: {
		children: "Active",
		variant: "default",
	},
	argTypes: {
		children: { control: "text" },
		variant: { control: "select", options: variants },
	},
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const LightTheme: Story = {
	render: () => <BadgeGallery themeName="light" />,
};

export const DarkTheme: Story = {
	render: () => <BadgeGallery themeName="dark" />,
};

function BadgeGallery({ themeName }: { themeName: "light" | "dark" }) {
	return (
		<ScopedTheme name={themeName}>
			<View style={styles.canvas}>
				<Text style={styles.sectionTitle}>Variants</Text>
				<View style={styles.row}>
					{variants.map((variant) => (
						<Badge key={variant} variant={variant}>
							{variantLabel(variant)}
						</Badge>
					))}
				</View>

				<Text style={styles.sectionTitle}>Labels</Text>
				<View style={styles.row}>
					<Badge>3 remaining</Badge>
					<Badge variant="secondary">Member</Badge>
					<Badge variant="outline">Pending sync</Badge>
				</View>
			</View>
		</ScopedTheme>
	);
}

function variantLabel(variant: BadgeVariant): string {
	return variant.charAt(0).toUpperCase() + variant.slice(1);
}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		gap: theme.spacing(3),
		padding: theme.spacing(6),
		backgroundColor: theme.colors.background,
	},
	sectionTitle: {
		...theme.typography.headline,
		color: theme.colors.foreground,
	},
	row: {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		gap: theme.spacing(3),
	},
}));
