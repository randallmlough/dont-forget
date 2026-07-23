import type { Meta, StoryObj } from "@storybook/react-native";
import { type ComponentProps, useState } from "react";
import { Button } from "./button";
import { Field, FieldDescription, FieldError, FieldLabel } from "./field";
import {
	FormStoryCanvas,
	FormStorySection,
	type FormStoryTheme,
} from "./form-story-layout";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from "./input-otp";

const DIGIT = /\d/;
const ALPHANUMERIC = /[A-Za-z0-9]/;
const FIRST_THREE_SLOTS = [0, 1, 2];
const LAST_THREE_SLOTS = [3, 4, 5];
const SIX_SLOTS = [...FIRST_THREE_SLOTS, ...LAST_THREE_SLOTS];

const meta = {
	title: "UI/Input OTP",
	component: InputOTP,
	args: {
		children: null,
		maxLength: 6,
	},
} satisfies Meta<typeof InputOTP>;

export default meta;

type Story = StoryObj<typeof meta>;

export const LightTheme: Story = {
	render: () => <InputOTPGallery themeName="light" />,
};

export const DarkTheme: Story = {
	render: () => <InputOTPGallery themeName="dark" />,
};

function InputOTPGallery({ themeName }: { themeName: FormStoryTheme }) {
	return (
		<FormStoryCanvas themeName={themeName}>
			<FormStorySection
				description="One native input drives composable visual slots, preserving paste and iOS one-time-code autofill."
				title="Six digits"
			>
				<Field>
					<FieldLabel>Verification code</FieldLabel>
					<DigitCode accessibilityLabel="Verification code" />
					<FieldDescription>
						Enter the code sent to your email address.
					</FieldDescription>
				</Field>
			</FormStorySection>

			<FormStorySection
				description="Split slots into groups and place separators anywhere in the composition."
				title="Separator"
			>
				<DigitCode accessibilityLabel="Separated verification code" separated />
			</FormStorySection>

			<FormStorySection
				description="The familiar value/onChangeText pair supports controlled form state."
				title="Controlled"
			>
				<ControlledCode />
			</FormStorySection>

			<FormStorySection
				description="InputOTP inherits disabled and invalid state from Field just like Input and InputGroup."
				title="States"
			>
				<Field disabled>
					<FieldLabel>Disabled code</FieldLabel>
					<DigitCode accessibilityLabel="Disabled code" defaultValue="123456" />
				</Field>
				<Field invalid>
					<FieldLabel>Invalid code</FieldLabel>
					<DigitCode accessibilityLabel="Invalid code" defaultValue="000000" />
					<FieldError>The verification code has expired.</FieldError>
				</Field>
			</FormStorySection>

			<FormStorySection
				description="Override the keyboard and pattern when a code accepts letters and numbers."
				title="Alphanumeric"
			>
				<InputOTP
					accessibilityLabel="Household join code"
					autoCapitalize="characters"
					keyboardType="ascii-capable"
					maxLength={6}
					pattern={ALPHANUMERIC}
				>
					<InputOTPGroup>
						{SIX_SLOTS.map((slotIndex) => (
							<InputOTPSlot
								index={slotIndex}
								key={`slot-${slotIndex}`}
								placeholder="•"
							/>
						))}
					</InputOTPGroup>
				</InputOTP>
			</FormStorySection>
		</FormStoryCanvas>
	);
}

function DigitCode({
	separated = false,
	...inputProps
}: Omit<
	ComponentProps<typeof InputOTP>,
	"children" | "maxLength" | "pattern"
> & {
	separated?: boolean;
}) {
	return (
		<InputOTP maxLength={6} pattern={DIGIT} {...inputProps}>
			<InputOTPGroup>
				{(separated ? FIRST_THREE_SLOTS : SIX_SLOTS).map((slotIndex) => (
					<InputOTPSlot index={slotIndex} key={`slot-${slotIndex}`} />
				))}
			</InputOTPGroup>
			{separated ? (
				<>
					<InputOTPSeparator />
					<InputOTPGroup>
						{LAST_THREE_SLOTS.map((slotIndex) => (
							<InputOTPSlot index={slotIndex} key={`slot-${slotIndex}`} />
						))}
					</InputOTPGroup>
				</>
			) : null}
		</InputOTP>
	);
}

function ControlledCode() {
	const [value, setValue] = useState("12");

	return (
		<Field>
			<FieldLabel>One-time password</FieldLabel>
			<DigitCode
				accessibilityLabel="One-time password"
				onChangeText={setValue}
				value={value}
			/>
			<FieldDescription>{value.length} of 6 digits entered.</FieldDescription>
			<Button onPress={() => setValue("")} size="sm" variant="secondary">
				Clear
			</Button>
		</Field>
	);
}
