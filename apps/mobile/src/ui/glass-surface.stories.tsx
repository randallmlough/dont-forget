import type { Meta, StoryObj } from "@storybook/react-native";
import { SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	Text,
	View,
} from "react-native";
import { ScopedTheme, StyleSheet, useUnistyles } from "react-native-unistyles";

import { GlassSurface } from "./glass-surface";

const meta = {
	title: "UI/GlassSurface",
	component: GlassSurface,
	args: { children: null },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const LightTheme: Story = {
	render: () => <GlassSurfaceGallery themeName="light" />,
};

export const DarkTheme: Story = {
	render: () => <GlassSurfaceGallery themeName="dark" />,
};

function GlassSurfaceGallery({ themeName }: { themeName: "light" | "dark" }) {
	return (
		<ScopedTheme name={themeName}>
			<ScrollView contentContainerStyle={styles.canvas} style={styles.screen}>
				<View style={styles.backdrop}>
					<View style={styles.primaryOrb} />
					<View style={styles.destructiveOrb} />

					<StorySection title="Tones">
						<GlassSurface style={styles.surface}>
							<SurfaceContent
								body="A neutral surface that adapts to the active theme."
								title="Default"
							/>
						</GlassSurface>
						<GlassSurface style={styles.surface} tone="selected">
							<SurfaceContent
								body="Selected tone adds primary emphasis without changing content."
								title="Selected"
							/>
						</GlassSurface>
					</StorySection>

					<StorySection title="Interactive">
						<Pressable
							accessibilityRole="button"
							onPress={noop}
							style={({ pressed }) => [
								styles.pressable,
								pressed ? styles.pressed : undefined,
							]}
						>
							<GlassSurface interactive style={styles.interactiveSurface}>
								<InteractiveContent />
							</GlassSurface>
						</Pressable>
					</StorySection>

					<StorySection title="Compact status">
						<StatusSurface />
					</StorySection>
				</View>
			</ScrollView>
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
			{children}
		</View>
	);
}

function SurfaceContent({ body, title }: { body: string; title: string }) {
	return (
		<View style={styles.surfaceContent}>
			<Text style={styles.surfaceTitle}>{title}</Text>
			<Text style={styles.surfaceBody}>{body}</Text>
		</View>
	);
}

function InteractiveContent() {
	const { theme } = useUnistyles();

	return (
		<View style={styles.interactiveContent}>
			<View style={styles.interactiveText}>
				<Text style={styles.surfaceTitle}>Open Groceries</Text>
				<Text style={styles.surfaceBody}>8 Items remaining</Text>
			</View>
			<SymbolView
				accessibilityElementsHidden
				accessible={false}
				name="chevron.right"
				size={theme.spacing(4)}
				tintColor={theme.colors.mutedForeground}
				weight="semibold"
			/>
		</View>
	);
}

function StatusSurface() {
	const { theme } = useUnistyles();

	return (
		<GlassSurface style={styles.statusSurface}>
			<ActivityIndicator color={theme.colors.primary} size="small" />
			<View style={styles.statusText}>
				<Text style={styles.surfaceTitle}>Syncing changes</Text>
				<Text style={styles.surfaceBody}>
					Available offline while you wait.
				</Text>
			</View>
		</GlassSurface>
	);
}

function noop() {}

const styles = StyleSheet.create((theme) => ({
	screen: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	canvas: {
		padding: theme.spacing(6),
	},
	backdrop: {
		gap: theme.spacing(6),
		padding: theme.spacing(4),
		borderRadius: theme.radii["2xl"],
		overflow: "hidden",
		backgroundColor: theme.colors.secondary,
	},
	primaryOrb: {
		position: "absolute",
		top: -theme.spacing(6),
		right: -theme.spacing(8),
		width: theme.spacing(36),
		height: theme.spacing(36),
		borderRadius: theme.radii.full,
		backgroundColor: theme.colors.primary,
		opacity: theme.opacities.pressed,
	},
	destructiveOrb: {
		position: "absolute",
		bottom: theme.spacing(12),
		left: -theme.spacing(12),
		width: theme.spacing(32),
		height: theme.spacing(32),
		borderRadius: theme.radii.full,
		backgroundColor: theme.colors.destructive,
		opacity: theme.opacities.disabled,
	},
	section: {
		gap: theme.spacing(3),
	},
	sectionTitle: {
		...theme.typography.headline,
		color: theme.colors.foreground,
	},
	surface: {
		borderRadius: theme.radii["2xl"],
	},
	surfaceContent: {
		gap: theme.spacing(1),
		padding: theme.spacing(5),
	},
	surfaceTitle: {
		...theme.typography.body,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.foreground,
	},
	surfaceBody: {
		...theme.typography.callout,
		color: theme.colors.mutedForeground,
	},
	pressable: {
		borderRadius: theme.radii["2xl"],
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
	interactiveSurface: {
		borderRadius: theme.radii["2xl"],
	},
	interactiveContent: {
		minHeight: theme.spacing(16),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(5),
		paddingVertical: theme.spacing(3),
	},
	interactiveText: {
		flex: 1,
		minWidth: 0,
		gap: theme.spacing(1),
	},
	statusSurface: {
		minHeight: theme.spacing(14),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(4),
		paddingVertical: theme.spacing(3),
		borderRadius: theme.radii.xl,
	},
	statusText: {
		flex: 1,
		minWidth: 0,
		gap: theme.spacing(0.5),
	},
}));
