import { useNativeState } from "@expo/ui/swift-ui";
import {
	autocorrectionDisabled,
	background,
	font,
	foregroundStyle,
	frame,
	glassEffect,
	padding,
	shapes,
	textContentType,
	textInputAutocapitalization,
	tint,
	type ViewModifier,
} from "@expo/ui/swift-ui/modifiers";
import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Button } from "./button";
import { Field, FieldDescription, FieldError, FieldLabel } from "./field";
import {
	FormStoryCanvas,
	FormStorySection,
	type FormStoryTheme,
	GlassStoryBackdrop,
} from "./form-story-layout";
import { Input, type InputKind } from "./input";
import {
	formatCardNumber,
	formatPhoneNumberUS,
	useInputMask,
} from "./input-mask";

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
				<MaskedFieldExample
					description="Formats up to 10 digits as a US phone number."
					format={formatPhoneNumberUS}
					kind="phone"
					label="Phone number"
					placeholder="(555) 123-4567"
				/>
				<MaskedFieldExample
					description="Groups up to 16 digits in blocks of four."
					format={formatCardNumber}
					kind="cardNumber"
					label="Card number"
					placeholder="1234 5678 9012 3456"
				/>
				<MaskedFieldExample
					description="Uppercases six alphanumeric characters and inserts a separator."
					format={formatHouseholdJoinCode}
					label="Household join code"
					modifiers={[
						textInputAutocapitalization("characters"),
						autocorrectionDisabled(),
					]}
					placeholder="ABC-123"
				/>
			</FormStorySection>

			<FormStorySection
				description="A user modifier replaces app styling of the same $type, so custom styling swaps cleanly instead of stacking."
				title="Custom styling"
			>
				<CustomModifierExamples />
			</FormStorySection>

			<FormStorySection
				description="glassEffect renders iOS 26 Liquid Glass. A clear background override removes the opaque surface so the material shows; the glass edge replaces the border ring."
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
			<FieldDescription>{mirror.length} characters</FieldDescription>
			<Button onPress={fillSuggestion} size="sm" variant="secondary">
				Fill suggestion
			</Button>
		</Field>
	);
}

function CustomModifierExamples() {
	const { theme } = useUnistyles();

	return (
		<>
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
		</>
	);
}

function GlassInputExamples() {
	const { theme } = useUnistyles();

	return (
		<GlassStoryBackdrop>
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
		</GlassStoryBackdrop>
	);
}

function MaskedFieldExample({
	description,
	format,
	kind,
	label,
	modifiers,
	placeholder,
}: {
	description: string;
	/** Pure formatter worklet applied on the native UI thread per keystroke. */
	format: (value: string) => string;
	kind?: InputKind;
	label: string;
	modifiers?: ViewModifier[];
	placeholder: string;
}) {
	const mask = useInputMask(format);

	return (
		<Field>
			<FieldLabel>{label}</FieldLabel>
			<Input
				accessibilityLabel={label}
				kind={kind}
				modifiers={modifiers}
				placeholder={placeholder}
				{...mask}
			/>
			<FieldDescription>{description}</FieldDescription>
		</Field>
	);
}

function formatHouseholdJoinCode(value: string) {
	"worklet";
	const characters = value
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "")
		.slice(0, 6);
	return characters.length > 3
		? `${characters.slice(0, 3)}-${characters.slice(3)}`
		: characters;
}

const styles = StyleSheet.create((theme) => ({
	playground: {
		padding: theme.spacing(6),
		backgroundColor: theme.colors.background,
	},
}));
