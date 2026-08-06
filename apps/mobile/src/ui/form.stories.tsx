import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "./button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./field";
import { Form } from "./form";
import {
	FormStoryCanvas,
	FormStorySection,
	type FormStoryTheme,
} from "./form-story-layout";
import { Input } from "./input";

const meta = {
	title: "UI/Form",
	component: Form,
} satisfies Meta<typeof Form>;

export default meta;

type Story = StoryObj<typeof meta>;

export const LightTheme: Story = {
	render: () => <FormGallery themeName="light" />,
};

export const DarkTheme: Story = {
	render: () => <FormGallery themeName="dark" />,
};

function FormGallery({ themeName }: { themeName: FormStoryTheme }) {
	return (
		<FormStoryCanvas themeName={themeName}>
			<FormStorySection
				description="Form provides consistent outer spacing. FieldGroup owns spacing between related Fields, and the caller owns values and submission."
				title="Profile form"
			>
				<ProfileForm />
			</FormStorySection>
		</FormStoryCanvas>
	);
}

function ProfileForm() {
	const [name, setName] = useState("Morgan");
	const [email, setEmail] = useState("morgan@example.com");
	const [submitted, setSubmitted] = useState(false);

	function submitProfile() {
		setSubmitted(true);
	}

	return (
		<Form>
			<FieldGroup>
				<Field required>
					<FieldLabel>Name</FieldLabel>
					<Input
						accessibilityLabel="Name"
						defaultValue={name}
						onTextChange={(value) => {
							setName(value);
							setSubmitted(false);
						}}
					/>
				</Field>
				<Field required>
					<FieldLabel>Email address</FieldLabel>
					<Input
						accessibilityLabel="Email address"
						defaultValue={email}
						kind="email"
						onTextChange={(value) => {
							setEmail(value);
							setSubmitted(false);
						}}
					/>
					<FieldDescription>
						Used for Household Invitations and account recovery.
					</FieldDescription>
				</Field>
			</FieldGroup>
			<Button onPress={submitProfile}>Save changes</Button>
			{submitted ? (
				<Text accessibilityRole="alert" style={styles.status}>
					Saved {name || "Member"} ({email || "no email"}).
				</Text>
			) : null}
		</Form>
	);
}

const styles = StyleSheet.create((theme) => ({
	status: {
		color: theme.colors.mutedForeground,
		...theme.typography.caption,
		textAlign: "center",
	},
}));
