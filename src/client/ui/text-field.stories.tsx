import { type TextFieldSelection, useNativeState } from "@expo/ui/swift-ui";
import {
	autocorrectionDisabled,
	background,
	font,
	foregroundStyle,
	frame,
	keyboardType,
	lineLimit,
	padding,
	shapes,
	textContentType,
	textInputAutocapitalization,
	tint,
} from "@expo/ui/swift-ui/modifiers";
import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Field, FieldDescription, FieldError, FieldLabel } from "./field";
import {
	FormStoryCanvas,
	FormStorySection,
	type FormStoryTheme,
} from "./form-story-layout";
import { TextField } from "./text-field";

const meta = {
	title: "UI/Text Field (SwiftUI Experiment)",
	component: TextField,
	args: {
		disabled: false,
		invalid: false,
		placeholder: "Add an Item…",
		variant: "default",
	},
	argTypes: {
		disabled: { control: "boolean" },
		invalid: { control: "boolean" },
		placeholder: { control: "text" },
		variant: {
			control: "select",
			options: ["default", "native", "rounded", "plain"],
		},
	},
} satisfies Meta<typeof TextField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
	render: (args) => (
		<View style={styles.playground}>
			<TextField {...args} accessibilityLabel="Experimental text field" />
		</View>
	),
};

export const LightTheme: Story = {
	render: () => <TextFieldGallery themeName="light" />,
};

export const DarkTheme: Story = {
	render: () => <TextFieldGallery themeName="dark" />,
};

function TextFieldGallery({ themeName }: { themeName: FormStoryTheme }) {
	return (
		<FormStoryCanvas themeName={themeName}>
			<FormStorySection
				description="These use SwiftUI textFieldStyle modifiers rather than React Native styles."
				title="Native styles"
			>
				<LabeledTextField label="Automatic" variant="native" />
				<LabeledTextField label="Rounded border" variant="rounded" />
				<LabeledTextField label="Plain" variant="plain" />
			</FormStorySection>

			<FormStorySection
				description="The default wrapper maps app tokens into SwiftUI modifiers."
				title="App styling"
			>
				<Field>
					<FieldLabel>Item name</FieldLabel>
					<TextField accessibilityLabel="Item name" placeholder="Whole milk" />
					<FieldDescription>
						Font, color, tint, padding, background, and radius are applied
						inside SwiftUI.
					</FieldDescription>
				</Field>
				<CustomModifierExamples />
			</FormStorySection>

			<FormStorySection title="States">
				<Field invalid>
					<FieldLabel>Email</FieldLabel>
					<TextField
						accessibilityLabel="Invalid email"
						defaultValue="not-an-email"
						invalid
					/>
					<FieldError>Enter a valid email address.</FieldError>
				</Field>
				<Field disabled>
					<FieldLabel>Household</FieldLabel>
					<TextField
						accessibilityLabel="Household"
						defaultValue="Golden Pantry"
						disabled
					/>
				</Field>
			</FormStorySection>

			<FormStorySection title="Controlled and multiline">
				<ControlledTextField />
				<Field>
					<FieldLabel>Notes</FieldLabel>
					<TextField
						accessibilityLabel="Item notes"
						axis="vertical"
						modifiers={[lineLimit(3)]}
						placeholder="Add details for another Member."
					/>
				</Field>
			</FormStorySection>

			<FormStorySection
				description="Type into each field to see its worklet format text synchronously on the native UI thread. Selection control requires iOS 18+."
				title="Worklet text masking"
			>
				<MaskedTextFieldExamples />
			</FormStorySection>
		</FormStoryCanvas>
	);
}

function LabeledTextField({
	label,
	variant,
}: {
	label: string;
	variant: "native" | "plain" | "rounded";
}) {
	return (
		<Field>
			<FieldLabel>{label}</FieldLabel>
			<TextField
				accessibilityLabel={`${label} text field`}
				placeholder="Type something…"
				variant={variant}
			/>
		</Field>
	);
}

function CustomModifierExamples() {
	const { theme } = useUnistyles();

	return (
		<View style={styles.examples}>
			<TextField
				accessibilityLabel="Capsule style"
				defaultValue="Custom capsule"
				modifiers={[
					font({ textStyle: "headline", design: "rounded" }),
					foregroundStyle(theme.colors.primaryForeground),
					tint(theme.colors.primaryForeground),
					frame({ minHeight: theme.spacing(12) }),
					padding({ horizontal: theme.spacing(4) }),
					background(theme.colors.primary, shapes.capsule()),
				]}
				variant="plain"
			/>
			<TextField
				accessibilityLabel="Serif style"
				defaultValue="Custom serif field"
				modifiers={[
					font({
						family: theme.fontFamilies.serif,
						size: theme.fontSizes.lg,
						weight: "semibold",
					}),
					foregroundStyle(theme.colors.secondaryForeground),
					frame({ minHeight: theme.spacing(12) }),
					padding({ horizontal: theme.spacing(4) }),
					background(
						theme.colors.secondary,
						shapes.roundedRectangle({ cornerRadius: theme.radii.xl }),
					),
				]}
				variant="plain"
			/>
		</View>
	);
}

function ControlledTextField() {
	const [value, setValue] = useState("");

	return (
		<Field>
			<FieldLabel>List name</FieldLabel>
			<TextField
				accessibilityLabel="List name"
				onChangeText={setValue}
				placeholder="Weekly groceries"
				value={value}
			/>
			<Text style={styles.valueLabel}>{value.length} characters</Text>
		</Field>
	);
}

function MaskedTextFieldExamples() {
	return (
		<View style={styles.examples}>
			<PhoneMaskExample />
			<CardMaskExample />
			<HouseholdJoinCodeMaskExample />
		</View>
	);
}

function PhoneMaskExample() {
	const text = useNativeState("");
	const selection = useNativeState<TextFieldSelection>({ start: 0, end: 0 });

	function handleTextChange(value: string) {
		"worklet";
		const digits = value.replace(/\D/g, "").slice(0, 10);
		let formatted = digits;

		if (digits.length > 6) {
			formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
		} else if (digits.length > 3) {
			formatted = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
		}

		// The Expo API intentionally mutates native state from the UI worklet.
		// eslint-disable-next-line react-hooks/immutability
		text.value = formatted;
		// eslint-disable-next-line react-hooks/immutability
		selection.value = { start: formatted.length, end: formatted.length };
	}

	return (
		<Field>
			<FieldLabel>Phone number</FieldLabel>
			<TextField
				accessibilityLabel="Phone number"
				modifiers={[
					keyboardType("phone-pad"),
					textContentType("telephoneNumber"),
				]}
				nativeSelectionState={selection}
				nativeTextState={text}
				onChangeText={handleTextChange}
				placeholder="(555) 123-4567"
			/>
			<FieldDescription>
				Formats up to 10 digits as a US phone number.
			</FieldDescription>
		</Field>
	);
}

function CardMaskExample() {
	const text = useNativeState("");
	const selection = useNativeState<TextFieldSelection>({ start: 0, end: 0 });

	function handleTextChange(value: string) {
		"worklet";
		const digits = value.replace(/\D/g, "").slice(0, 16);
		const formatted = digits.replace(/(\d{4})(?=\d)/g, "$1 ");

		// eslint-disable-next-line react-hooks/immutability
		text.value = formatted;
		// eslint-disable-next-line react-hooks/immutability
		selection.value = { start: formatted.length, end: formatted.length };
	}

	return (
		<Field>
			<FieldLabel>Card number</FieldLabel>
			<TextField
				accessibilityLabel="Card number"
				modifiers={[
					keyboardType("numeric"),
					textContentType("creditCardNumber"),
				]}
				nativeSelectionState={selection}
				nativeTextState={text}
				onChangeText={handleTextChange}
				placeholder="1234 5678 9012 3456"
			/>
			<FieldDescription>
				Groups up to 16 digits in blocks of four.
			</FieldDescription>
		</Field>
	);
}

function HouseholdJoinCodeMaskExample() {
	const text = useNativeState("");
	const selection = useNativeState<TextFieldSelection>({ start: 0, end: 0 });

	function handleTextChange(value: string) {
		"worklet";
		const characters = value
			.toUpperCase()
			.replace(/[^A-Z0-9]/g, "")
			.slice(0, 6);
		const formatted =
			characters.length > 3
				? `${characters.slice(0, 3)}-${characters.slice(3)}`
				: characters;

		// eslint-disable-next-line react-hooks/immutability
		text.value = formatted;
		// eslint-disable-next-line react-hooks/immutability
		selection.value = { start: formatted.length, end: formatted.length };
	}

	return (
		<Field>
			<FieldLabel>Household join code</FieldLabel>
			<TextField
				accessibilityLabel="Household join code"
				modifiers={[
					textInputAutocapitalization("characters"),
					autocorrectionDisabled(),
				]}
				nativeSelectionState={selection}
				nativeTextState={text}
				onChangeText={handleTextChange}
				placeholder="ABC-123"
			/>
			<FieldDescription>
				Uppercases six alphanumeric characters and inserts a separator.
			</FieldDescription>
		</Field>
	);
}

const styles = StyleSheet.create((theme) => ({
	playground: {
		padding: theme.spacing(6),
		backgroundColor: theme.colors.background,
	},
	examples: {
		gap: theme.spacing(4),
	},
	valueLabel: {
		color: theme.colors.mutedForeground,
		...theme.typography.caption,
	},
}));
