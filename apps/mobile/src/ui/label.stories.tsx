import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
	FormStoryCanvas,
	FormStorySection,
	type FormStoryTheme,
} from "./form-story-layout";
import { Input } from "./input";
import { Label } from "./label";

const meta = {
	title: "UI/Label",
	component: Label,
} satisfies Meta<typeof Label>;

export default meta;

type Story = StoryObj<typeof meta>;

export const LightTheme: Story = {
	render: () => <LabelGallery themeName="light" />,
};

export const DarkTheme: Story = {
	render: () => <LabelGallery themeName="dark" />,
};

function LabelGallery({ themeName }: { themeName: FormStoryTheme }) {
	return (
		<FormStoryCanvas themeName={themeName}>
			<FormStorySection
				description="React Native labels stay adjacent to their controls; the control carries the matching accessibility label."
				title="With a control"
			>
				<View style={styles.pair}>
					<Label>Email address</Label>
					<Input accessibilityLabel="Email address" kind="email" />
				</View>
			</FormStorySection>

			<FormStorySection
				description="Use the disabled prop when Label is composed without Field state."
				title="Disabled"
			>
				<View style={styles.pair}>
					<Label disabled>Household name</Label>
					<Input
						accessibilityLabel="Household name"
						defaultValue="Golden Pantry"
						disabled
					/>
				</View>
			</FormStorySection>
		</FormStoryCanvas>
	);
}

const styles = StyleSheet.create((theme) => ({
	pair: {
		gap: theme.spacing(2),
	},
}));
