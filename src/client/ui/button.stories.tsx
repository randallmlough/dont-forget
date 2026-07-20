import type { Meta, StoryObj } from "@storybook/react-native";
import { SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { ScopedTheme, StyleSheet, useUnistyles } from "react-native-unistyles";

import {
	Button,
	type ButtonRadius,
	type ButtonSize,
	type ButtonVariant,
} from "./button";

const variants = [
	"default",
	"destructive",
	"outline",
	"secondary",
	"ghost",
	"link",
] satisfies ButtonVariant[];

const sizes = ["sm", "default", "lg"] satisfies ButtonSize[];

const radii = [
	"none",
	"sm",
	"md",
	"lg",
	"xl",
	"2xl",
	"full",
] satisfies ButtonRadius[];

const meta = {
	title: "UI/Button",
	component: Button,
	args: {
		children: "Add Item",
		disabled: false,
		loading: false,
		onPress: noop,
		radius: "md",
		size: "default",
		variant: "default",
	},
	argTypes: {
		children: { control: "text" },
		disabled: { control: "boolean" },
		loading: { control: "boolean" },
		radius: { control: "select", options: radii },
		size: { control: "select", options: [...sizes, "icon"] },
		variant: { control: "select", options: variants },
	},
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const LightTheme: Story = {
	render: () => <ButtonGallery themeName="light" />,
};

export const DarkTheme: Story = {
	render: () => <ButtonGallery themeName="dark" />,
};

function IconButtons() {
	const { theme } = useUnistyles();

	return (
		<>
			<Button onPress={noop} variant="outline">
				<SymbolView
					accessibilityElementsHidden
					accessible={false}
					name="chevron.left"
					size={theme.spacing(4)}
					tintColor={theme.colors.foreground}
					weight="medium"
				/>
				<Text style={styles.outlineLabel}>Previous</Text>
			</Button>
			<Button onPress={noop}>
				<Text style={styles.defaultLabel}>Next</Text>
				<SymbolView
					accessibilityElementsHidden
					accessible={false}
					name="chevron.right"
					size={theme.spacing(4)}
					tintColor={theme.colors.primaryForeground}
					weight="medium"
				/>
			</Button>
		</>
	);
}

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

				<StorySection title="With icons">
					<IconButtons />
				</StorySection>

				<StorySection title="Radii">
					{radii.map((radius) => (
						<Button key={radius} onPress={noop} radius={radius}>
							{radiusLabel(radius)}
						</Button>
					))}
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

function radiusLabel(radius: ButtonRadius): string {
	return radius === "md" ? "MD (Default)" : radius.toUpperCase();
}

function noop() {}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		gap: theme.spacing(6),
		padding: theme.spacing(6),
		backgroundColor: theme.colors.background,
	},
	defaultLabel: {
		...theme.typography.callout,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.primaryForeground,
	},
	outlineLabel: {
		...theme.typography.callout,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.foreground,
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
