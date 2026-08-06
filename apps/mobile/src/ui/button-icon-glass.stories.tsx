import type { Meta, StoryObj } from "@storybook/react-native";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import {
	ButtonIconGlass,
	type ButtonIconGlassProps,
	type ButtonIconGlassSize,
} from "./button-icon-glass";
import {
	FormStoryCanvas,
	FormStorySection,
	type FormStoryTheme,
	GlassStoryBackdrop,
} from "./form-story-layout";

const sizes = ["sm", "default", "lg"] satisfies ButtonIconGlassSize[];

const meta = {
	title: "UI/ButtonIconGlass",
	component: ButtonIconGlass,
	args: {
		accessibilityLabel: "Open Lists",
		disabled: false,
		loading: false,
		onPress: noop,
		showShadow: true,
		showTint: true,
		size: "default",
		systemImage: "list.bullet",
	},
	argTypes: {
		disabled: { control: "boolean" },
		loading: { control: "boolean" },
		showShadow: { control: "boolean" },
		showTint: { control: "boolean" },
		size: { control: "select", options: sizes },
		systemImage: { control: "text" },
	},
	render: (args) => (
		<FormStoryCanvas themeName="light">
			<GlassStoryBackdrop>
				<ButtonIconGlass {...args} />
			</GlassStoryBackdrop>
		</FormStoryCanvas>
	),
} satisfies Meta<typeof ButtonIconGlass>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const LightTheme: Story = {
	render: () => <ButtonIconGlassGallery themeName="light" />,
};

export const DarkTheme: Story = {
	render: () => <ButtonIconGlassGallery themeName="dark" />,
};

function ButtonIconGlassGallery({ themeName }: { themeName: FormStoryTheme }) {
	return (
		<FormStoryCanvas themeName={themeName}>
			<FormStorySection
				description="SF Symbols render as circular native glass controls with explicit accessibility labels."
				title="Symbols"
			>
				<IconExamples
					examples={[
						{
							caption: "Add",
							props: {
								accessibilityLabel: "Add Item",
								systemImage: "plus",
							},
						},
						{
							caption: "Lists",
							props: {
								accessibilityLabel: "Open Lists",
								systemImage: "list.bullet",
							},
						},
						{
							caption: "Settings",
							props: {
								accessibilityLabel: "Open Settings",
								systemImage: "gearshape",
							},
						},
					]}
				/>
			</FormStorySection>

			<FormStorySection
				description="Choose the elevated glass button style or the flatter clear-glass treatment."
				title="Drop shadow"
			>
				<IconExamples
					examples={[
						{
							caption: "Shadow",
							props: {
								accessibilityLabel: "Favorite",
								showShadow: true,
								systemImage: "heart",
							},
						},
						{
							caption: "No shadow",
							props: {
								accessibilityLabel: "Favorite",
								showShadow: false,
								systemImage: "heart",
							},
						},
					]}
				/>
			</FormStorySection>

			<FormStorySection
				description="Tint can be omitted to show the native glass material without the app's color treatment."
				title="Tint"
			>
				<IconExamples
					examples={[
						{
							caption: "Tinted",
							props: {
								accessibilityLabel: "Add Item",
								systemImage: "plus",
							},
						},
						{
							caption: "Untinted",
							props: {
								accessibilityLabel: "Add Item",
								showTint: false,
								systemImage: "plus",
							},
						},
					]}
				/>
			</FormStorySection>

			<FormStorySection
				description="Every size remains circular and preserves at least a 44-point touch target."
				title="Sizes"
			>
				<IconExamples
					examples={sizes.map((size) => ({
						caption: sizeLabel(size),
						props: {
							accessibilityLabel: "Open Lists",
							size,
							systemImage: "list.bullet",
						},
					}))}
				/>
			</FormStorySection>

			<FormStorySection
				description="Loading disables activation and replaces the symbol with native progress."
				title="States"
			>
				<IconExamples
					examples={[
						{
							caption: "Enabled",
							props: {
								accessibilityLabel: "Confirm",
								systemImage: "checkmark",
							},
						},
						{
							caption: "Disabled",
							props: {
								accessibilityLabel: "Unlock",
								disabled: true,
								systemImage: "lock",
							},
						},
						{
							caption: "Loading",
							props: {
								accessibilityLabel: "Save",
								loading: true,
								systemImage: "square.and.arrow.down",
							},
						},
					]}
				/>
			</FormStorySection>
		</FormStoryCanvas>
	);
}

type IconExample = {
	caption: string;
	props: ButtonIconGlassProps;
};

function IconExamples({ examples }: { examples: readonly IconExample[] }) {
	return (
		<GlassStoryBackdrop>
			<View style={styles.row}>
				{examples.map((example) => (
					<View key={example.caption} style={styles.example}>
						<ButtonIconGlass {...example.props} onPress={noop} />
						<Text style={styles.caption}>{example.caption}</Text>
					</View>
				))}
			</View>
		</GlassStoryBackdrop>
	);
}

function sizeLabel(size: ButtonIconGlassSize): string {
	return size === "default" ? "Default" : size.toUpperCase();
}

function noop() {}

const styles = StyleSheet.create((theme) => ({
	row: {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "flex-start",
		gap: theme.spacing(5),
	},
	example: {
		alignItems: "center",
		gap: theme.spacing(1),
	},
	caption: {
		color: theme.colors.mutedForeground,
		...theme.typography.caption,
	},
}));
