import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import {
	ButtonGlass,
	type ButtonGlassProps,
	type ButtonGlassSize,
} from "./button-glass";
import {
	FormStoryCanvas,
	FormStorySection,
	type FormStoryTheme,
	GlassStoryBackdrop,
} from "./form-story-layout";

const sizes = ["sm", "default", "lg"] satisfies ButtonGlassSize[];

const meta = {
	title: "UI/ButtonGlass",
	component: ButtonGlass,
	args: {
		disabled: false,
		label: "Add Item",
		loading: false,
		onPress: noop,
		showShadow: true,
		showTint: true,
		size: "default",
	},
	argTypes: {
		disabled: { control: "boolean" },
		label: { control: "text" },
		loading: { control: "boolean" },
		showShadow: { control: "boolean" },
		showTint: { control: "boolean" },
		size: { control: "select", options: sizes },
		systemImage: { control: "text" },
	},
	render: (args) => (
		<FormStoryCanvas themeName="light">
			<GlassStoryBackdrop>
				<ButtonGlass {...args} />
			</GlassStoryBackdrop>
		</FormStoryCanvas>
	),
} satisfies Meta<typeof ButtonGlass>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const LightTheme: Story = {
	render: () => <ButtonGlassGallery themeName="light" />,
};

export const DarkTheme: Story = {
	render: () => <ButtonGlassGallery themeName="dark" />,
};

function ButtonGlassGallery({ themeName }: { themeName: FormStoryTheme }) {
	return (
		<FormStoryCanvas themeName={themeName}>
			<FormStorySection
				description="Native SwiftUI labels and SF Symbols stay inside the glass control without an RNHostView bridge."
				title="Content"
			>
				<GlassExamples
					examples={[
						{ label: "Add Item" },
						{ label: "Create Household", systemImage: "person.2.badge.plus" },
						{ label: "Open Lists", systemImage: "list.bullet" },
					]}
				/>
			</FormStorySection>

			<FormStorySection
				description="The shadowless option uses SwiftUI's flatter clear-glass material instead of the elevated glass button style."
				title="Drop shadow"
			>
				<GlassExamples
					examples={[
						{ label: "Default shadow", showShadow: true },
						{ label: "No shadow", showShadow: false },
					]}
				/>
			</FormStorySection>

			<FormStorySection
				description="Full-radius buttons use capsules; other radii use rounded rectangles."
				title="Shapes"
			>
				<GlassExamples
					examples={[
						{ label: "Rounded" },
						{ label: "Capsule", radius: "full" },
					]}
				/>
			</FormStorySection>

			<FormStorySection
				description="Tint can be omitted to show the native glass material without the app's color treatment."
				title="Tint"
			>
				<GlassExamples
					examples={[
						{ label: "Untinted", showTint: false },
						{ label: "Tinted" },
					]}
				/>
			</FormStorySection>

			<FormStorySection
				description="Small uses a tighter visible surface while every size preserves at least a 44-point touch target."
				title="Sizes"
			>
				<GlassStoryBackdrop>
					<View style={styles.row}>
						{sizes.map((size) => (
							<ButtonGlass
								key={size}
								label={sizeLabel(size)}
								onPress={noop}
								size={size}
							/>
						))}
					</View>
				</GlassStoryBackdrop>
			</FormStorySection>

			<FormStorySection
				description="Loading disables activation and replaces the optional symbol with native progress."
				title="States"
			>
				<GlassExamples
					examples={[
						{ label: "Enabled", systemImage: "checkmark" },
						{ disabled: true, label: "Disabled", systemImage: "lock" },
						{
							label: "Saving",
							loading: true,
							systemImage: "square.and.arrow.down",
						},
					]}
				/>
			</FormStorySection>
		</FormStoryCanvas>
	);
}

function GlassExamples({
	examples,
}: {
	examples: readonly ButtonGlassProps[];
}) {
	return (
		<GlassStoryBackdrop>
			<View style={styles.row}>
				{examples.map((example) => (
					<ButtonGlass key={example.label} {...example} onPress={noop} />
				))}
			</View>
		</GlassStoryBackdrop>
	);
}

function sizeLabel(size: ButtonGlassSize): string {
	return size === "default" ? "Default" : size.toUpperCase();
}

function noop() {}

const styles = StyleSheet.create((theme) => ({
	row: {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		gap: theme.spacing(3),
	},
}));
