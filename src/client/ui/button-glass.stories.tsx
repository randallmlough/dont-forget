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
		size: "default",
	},
	argTypes: {
		disabled: { control: "boolean" },
		label: { control: "text" },
		loading: { control: "boolean" },
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
				description="Control size changes native metrics while preserving the app's minimum touch target."
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
	examples: readonly Pick<
		ButtonGlassProps,
		"disabled" | "label" | "loading" | "systemImage"
	>[];
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
