import { type TextFieldSelection, useNativeState } from "@expo/ui/swift-ui";
import {
	autocorrectionDisabled,
	background,
	font,
	foregroundStyle,
	frame,
	glassEffect,
	keyboardType,
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

import { Button } from "./button";
import { Field, FieldDescription, FieldError, FieldLabel } from "./field";
import {
	FormStoryCanvas,
	FormStorySection,
	type FormStoryTheme,
} from "./form-story-layout";
import { Input } from "./input";

const meta = {
	title: "UI/Input",
	component: Input,
	args: {
		disabled: false,
		invalid: false,
		placeholder: "Add an Item…",
		secureTextEntry: false,
	},
	argTypes: {
		disabled: { control: "boolean" },
		invalid: { control: "boolean" },
		placeholder: { control: "text" },
		secureTextEntry: { control: "boolean" },
	},
} satisfies Meta<typeof Input>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
	render: (args) => (
		<View style={styles.playground}>
			<Input {...args} accessibilityLabel="Playground input" />
		</View>
	),
};

export const LightTheme: Story = {
	render: () => <InputGallery themeName="light" />,
};

export const DarkTheme: Story = {
	render: () => <InputGallery themeName="dark" />,
};

function InputGallery({ themeName }: { themeName: FormStoryTheme }) {
	return (
		<FormStoryCanvas themeName={themeName}>
			<FormStorySection
				description="Font, color, tint, padding, background, border, and radius are SwiftUI modifiers driven by app tokens. Focus the input to see the border tint."
				title="App styling"
			>
				<Field>
					<FieldLabel>Item name</FieldLabel>
					<Input accessibilityLabel="Item name" placeholder="Whole milk" />
					<FieldDescription>
						Standalone inputs wrap themselves in a Host sized by matchContents.
					</FieldDescription>
				</Field>
			</FormStorySection>

			<FormStorySection
				description="Input inherits invalid and disabled from the surrounding Field via context — no prop duplication."
				title="States"
			>
				<Field invalid>
					<FieldLabel>Email</FieldLabel>
					<Input
						accessibilityLabel="Invalid email"
						defaultValue="not-an-email"
					/>
					<FieldError>Enter a valid email address.</FieldError>
				</Field>
				<Field disabled>
					<FieldLabel>Household</FieldLabel>
					<Input accessibilityLabel="Household" defaultValue="Golden Pantry" />
				</Field>
			</FormStorySection>

			<FormStorySection
				description="secureTextEntry swaps in a SwiftUI SecureField behind the same props."
				title="Secure entry"
			>
				<Field>
					<FieldLabel>Passphrase</FieldLabel>
					<Input
						accessibilityLabel="Passphrase"
						modifiers={[textContentType("password")]}
						placeholder="Required to join"
						secureTextEntry
					/>
				</Field>
			</FormStorySection>

			<FormStorySection
				description="Controlled text passes an ObservableState created with useNativeState. JS writes are asynchronous, so a JS mirror tracks length via onTextChange."
				title="Controlled text"
			>
				<ControlledInput />
			</FormStorySection>

			<FormStorySection
				description="axis=vertical grows with content; matchContents lets the Host track the SwiftUI height instead of a fixed style height."
				title="Multiline growth"
			>
				<Field>
					<FieldLabel>Notes</FieldLabel>
					<Input
						accessibilityLabel="Item notes"
						axis="vertical"
						placeholder="Add details for another Member."
					/>
				</Field>
			</FormStorySection>

			<FormStorySection
				description="Type into each input to see its worklet format text synchronously on the native UI thread. Selection control requires iOS 18+."
				title="Worklet text masking"
			>
				<MaskedInputExamples />
			</FormStorySection>

			<FormStorySection
				description="A user modifier replaces app styling of the same $type, so custom chrome swaps cleanly instead of stacking."
				title="Custom chrome"
			>
				<CustomModifierExamples />
			</FormStorySection>

			<FormStorySection
				description="glassEffect renders iOS 26 Liquid Glass. A clear background override removes the opaque chrome so the material shows; the glass edge replaces the border ring."
				title="Glass appearance"
			>
				<GlassInputExamples />
			</FormStorySection>
		</FormStoryCanvas>
	);
}

function ControlledInput() {
	const text = useNativeState("");
	const [mirror, setMirror] = useState("");

	function fillSuggestion() {
		text.set("Weekly groceries");
		setMirror("Weekly groceries");
	}

	return (
		<Field>
			<FieldLabel>List name</FieldLabel>
			<Input
				accessibilityLabel="List name"
				onTextChange={setMirror}
				placeholder="Weekly groceries"
				text={text}
			/>
			<Text style={styles.valueLabel}>{mirror.length} characters</Text>
			<Button onPress={fillSuggestion} size="sm" variant="secondary">
				Fill suggestion
			</Button>
		</Field>
	);
}

function CustomModifierExamples() {
	const { theme } = useUnistyles();

	return (
		<View style={styles.examples}>
			<Input
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
			/>
			<Input
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
			/>
		</View>
	);
}

function GlassInputExamples() {
	const { theme } = useUnistyles();

	return (
		<View style={styles.glassBackdrop}>
			<View style={styles.glassPrimaryOrb} />
			<View style={styles.glassDestructiveOrb} />
			<Field>
				<FieldLabel>Regular glass</FieldLabel>
				<Input
					accessibilityLabel="Regular glass"
					modifiers={[
						background(
							"clear",
							shapes.roundedRectangle({ cornerRadius: theme.radii.md }),
						),
						glassEffect({
							glass: { variant: "regular", interactive: true },
							shape: "roundedRectangle",
							cornerRadius: theme.radii.md,
						}),
					]}
					placeholder="Add an Item…"
				/>
			</Field>
			<Field>
				<FieldLabel>Tinted capsule</FieldLabel>
				<Input
					accessibilityLabel="Tinted glass"
					defaultValue="Golden Pantry"
					modifiers={[
						background("clear", shapes.capsule()),
						glassEffect({
							glass: {
								variant: "regular",
								interactive: true,
								tint: theme.colors.glassTint,
							},
							shape: "capsule",
						}),
					]}
				/>
			</Field>
			<Field>
				<FieldLabel>Clear glass</FieldLabel>
				<Input
					accessibilityLabel="Clear glass"
					modifiers={[
						background(
							"clear",
							shapes.roundedRectangle({ cornerRadius: theme.radii.md }),
						),
						glassEffect({
							glass: { variant: "clear" },
							shape: "roundedRectangle",
							cornerRadius: theme.radii.md,
						}),
					]}
					placeholder="Reads the backdrop through the material."
				/>
			</Field>
		</View>
	);
}

function MaskedInputExamples() {
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
			<Input
				accessibilityLabel="Phone number"
				modifiers={[
					keyboardType("phone-pad"),
					textContentType("telephoneNumber"),
				]}
				onTextChange={handleTextChange}
				placeholder="(555) 123-4567"
				selection={selection}
				text={text}
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
			<Input
				accessibilityLabel="Card number"
				modifiers={[
					keyboardType("numeric"),
					textContentType("creditCardNumber"),
				]}
				onTextChange={handleTextChange}
				placeholder="1234 5678 9012 3456"
				selection={selection}
				text={text}
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
			<Input
				accessibilityLabel="Household join code"
				modifiers={[
					textInputAutocapitalization("characters"),
					autocorrectionDisabled(),
				]}
				onTextChange={handleTextChange}
				placeholder="ABC-123"
				selection={selection}
				text={text}
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
	glassBackdrop: {
		gap: theme.spacing(4),
		padding: theme.spacing(4),
		borderRadius: theme.radii["2xl"],
		overflow: "hidden",
		backgroundColor: theme.colors.secondary,
	},
	glassPrimaryOrb: {
		position: "absolute",
		top: -theme.spacing(6),
		right: -theme.spacing(8),
		width: theme.spacing(36),
		height: theme.spacing(36),
		borderRadius: theme.radii.full,
		backgroundColor: theme.colors.primary,
		opacity: theme.opacities.pressed,
	},
	glassDestructiveOrb: {
		position: "absolute",
		bottom: theme.spacing(12),
		left: -theme.spacing(12),
		width: theme.spacing(32),
		height: theme.spacing(32),
		borderRadius: theme.radii.full,
		backgroundColor: theme.colors.destructive,
		opacity: theme.opacities.disabled,
	},
	valueLabel: {
		color: theme.colors.mutedForeground,
		...theme.typography.caption,
	},
}));
