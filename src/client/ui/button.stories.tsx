import type { Meta, StoryObj } from "@storybook/react-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { ScopedTheme, StyleSheet } from "react-native-unistyles";

import { Button, type ButtonSize, type ButtonVariant } from "./button";

const meta = {
	title: "UI/Button",
	component: Button,
	args: {
		children: "Add Item",
		onPress: noop,
	},
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const LightTheme: Story = {
	render: () => <ButtonGallery themeName="light" />,
};

export const DarkTheme: Story = {
	render: () => <ButtonGallery themeName="dark" />,
};

const variants = [
	"default",
	"destructive",
	"outline",
	"secondary",
	"ghost",
	"link",
] satisfies ButtonVariant[];

const sizes = ["sm", "default", "lg"] satisfies ButtonSize[];

function ButtonGallery({ themeName }: { themeName: "light" | "dark" }) {
	return (
		<ScopedTheme name={themeName}>
			<View style={styles.canvas}>
				<StorySection title="Variants">
					{variants.map((variant) => (
						<Button key={variant} onPress={noop} variant={variant}>
							{variantLabel(variant)}
						</Button>
					))}
				</StorySection>

				<StorySection title="Sizes">
					{sizes.map((size) => (
						<Button key={size} onPress={noop} size={size}>
							{sizeLabel(size)}
						</Button>
					))}
					<Button accessibilityLabel="Add Item" onPress={noop} size="icon">
						+
					</Button>
				</StorySection>

				<StorySection title="States">
					<Button loading onPress={noop}>
						Saving
					</Button>
					<Button disabled onPress={noop}>
						Disabled
					</Button>
				</StorySection>
			</View>
		</ScopedTheme>
	);
}

function StorySection({
	children,
	title,
}: {
	children: ReactNode;
	title: string;
}) {
	return (
		<View style={styles.section}>
			<Text style={styles.sectionTitle}>{title}</Text>
			<View style={styles.row}>{children}</View>
		</View>
	);
}

function variantLabel(variant: ButtonVariant): string {
	return variant.charAt(0).toUpperCase() + variant.slice(1);
}

function sizeLabel(size: Exclude<ButtonSize, "icon">): string {
	return size === "default" ? "Default" : size.toUpperCase();
}

function noop() {}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		gap: theme.spacing(6),
		padding: theme.spacing(6),
		backgroundColor: theme.colors.background,
	},
	section: {
		gap: theme.spacing(3),
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
