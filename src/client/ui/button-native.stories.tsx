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
import { ButtonNative } from "./button-native";
import { GlassStoryBackdrop } from "./form-story-layout";

const variants = [
	"default",
	"destructive",
	"outline",
	"secondary",
	"ghost",
	"glass",
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
	title: "UI/ButtonNative (Spike)",
	component: ButtonNative,
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
} satisfies Meta<typeof ButtonNative>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const LightTheme: Story = {
	render: () => <ButtonNativeGallery themeName="light" />,
};

export const DarkTheme: Story = {
	render: () => <ButtonNativeGallery themeName="dark" />,
};

export const GlassComparison: Story = {
	render: () => (
		<ScopedTheme name="light">
			<View style={styles.canvas}>
				<StorySection title="Glass implementations">
					<GlassStoryBackdrop>
						<View style={styles.comparison}>
							<ComparisonRow label="Pressable + GlassSurface">
								<Button onPress={noop} variant="glass">
									Add Item
								</Button>
							</ComparisonRow>
							<ComparisonRow label="Expo UI SwiftUI Button">
								<ButtonNative onPress={noop} variant="glass">
									Add Item
								</ButtonNative>
							</ComparisonRow>
						</View>
					</GlassStoryBackdrop>
				</StorySection>
			</View>
		</ScopedTheme>
	),
};

function ButtonNativeGallery({ themeName }: { themeName: "light" | "dark" }) {
	return (
		<ScopedTheme name={themeName}>
			<View style={styles.canvas}>
				<StorySection title="Variants">
					{variants.map((variant) => (
						<ButtonNative key={variant} onPress={noop} variant={variant}>
							{variantLabel(variant)}
						</ButtonNative>
					))}
				</StorySection>

				<StorySection title="Sizes">
					{sizes.map((size) => (
						<ButtonNative key={size} onPress={noop} size={size}>
							{sizeLabel(size)}
						</ButtonNative>
					))}
					<ButtonNative
						accessibilityLabel="Add Item"
						onPress={noop}
						size="icon"
					>
						+
					</ButtonNative>
				</StorySection>

				<StorySection title="React Native content bridge">
					<NativeIconButton />
				</StorySection>

				<StorySection title="Radii">
					{radii.map((radius) => (
						<ButtonNative key={radius} onPress={noop} radius={radius}>
							{radiusLabel(radius)}
						</ButtonNative>
					))}
				</StorySection>

				<StorySection title="States">
					<ButtonNative loading onPress={noop}>
						Saving
					</ButtonNative>
					<ButtonNative disabled onPress={noop}>
						Disabled
					</ButtonNative>
				</StorySection>

				<StorySection title="Glass">
					<GlassStoryBackdrop>
						<ButtonNative onPress={noop} variant="glass">
							Add Item
						</ButtonNative>
					</GlassStoryBackdrop>
				</StorySection>
			</View>
		</ScopedTheme>
	);
}

function NativeIconButton() {
	const { theme } = useUnistyles();

	return (
		<ButtonNative accessibilityLabel="Continue" onPress={noop}>
			<View style={styles.customContent}>
				<Text style={styles.customLabel}>Continue</Text>
				<SymbolView
					accessibilityElementsHidden
					accessible={false}
					name="chevron.right"
					size={theme.spacing(4)}
					tintColor={theme.colors.primaryForeground}
					weight="medium"
				/>
			</View>
		</ButtonNative>
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

function ComparisonRow({
	children,
	label,
}: {
	children: ReactNode;
	label: string;
}) {
	return (
		<View style={styles.comparisonRow}>
			<Text style={styles.comparisonLabel}>{label}</Text>
			{children}
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
	comparison: {
		gap: theme.spacing(4),
	},
	comparisonRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: theme.spacing(4),
	},
	comparisonLabel: {
		...theme.typography.callout,
		color: theme.colors.foreground,
	},
	customContent: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(2),
	},
	customLabel: {
		...theme.typography.callout,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.primaryForeground,
	},
}));
