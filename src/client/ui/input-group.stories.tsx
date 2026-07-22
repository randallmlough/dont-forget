import {
	Button as SwiftUIButton,
	Image as SwiftUIImage,
	useNativeState,
} from "@expo/ui/swift-ui";
import {
	background,
	glassEffect,
	keyboardType,
	shapes,
} from "@expo/ui/swift-ui/modifiers";
import type { Meta, StoryObj } from "@storybook/react-native";
import { useUnistyles } from "react-native-unistyles";

import { Field, FieldDescription, FieldError, FieldLabel } from "./field";
import {
	FormStoryCanvas,
	FormStorySection,
	type FormStoryTheme,
	GlassStoryBackdrop,
} from "./form-story-layout";
import { Input } from "./input";
import { InputGroup } from "./input-group";

const meta = {
	title: "UI/Input Group",
	component: InputGroup,
} satisfies Meta<typeof InputGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const LightTheme: Story = {
	render: () => <InputGroupGallery themeName="light" />,
};

export const DarkTheme: Story = {
	render: () => <InputGroupGallery themeName="dark" />,
};

function InputGroupGallery({ themeName }: { themeName: FormStoryTheme }) {
	return (
		<FormStoryCanvas themeName={themeName}>
			<FormStorySection
				description="The group owns the Host and chrome; SwiftUI addons sit inside the bordered surface. Tapping an addon focuses the input."
				title="Addons"
			>
				<Field>
					<FieldLabel>Search</FieldLabel>
					<SearchInputGroup />
				</Field>
				<ClearableInputGroup />
			</FormStorySection>

			<FormStorySection
				description="InputGroup inherits invalid and disabled from the surrounding Field via context, and the input inside inherits them from the group."
				title="States"
			>
				<Field invalid>
					<FieldLabel>Email</FieldLabel>
					<EmailInputGroup />
					<FieldError>Enter a valid email address.</FieldError>
				</Field>
				<Field disabled>
					<FieldLabel>Household</FieldLabel>
					<DisabledInputGroup />
				</Field>
			</FormStorySection>

			<FormStorySection
				description="The group's modifiers escape hatch applies iOS 26 Liquid Glass to the shared surface: a clear background override removes the opaque chrome, and addons plus tap-to-focus keep working."
				title="Glass appearance"
			>
				<GlassInputGroupExamples />
			</FormStorySection>
		</FormStoryCanvas>
	);
}

function GlassInputGroupExamples() {
	const { theme } = useUnistyles();
	const text = useNativeState("Golden Pantry");

	return (
		<GlassStoryBackdrop>
			<Field>
				<FieldLabel>Regular glass</FieldLabel>
				<InputGroup
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
				>
					<SwiftUIImage
						color={theme.colors.mutedForeground}
						size={16}
						systemName="magnifyingglass"
					/>
					<Input accessibilityLabel="Glass search" placeholder="Search Items" />
				</InputGroup>
			</Field>
			<Field>
				<FieldLabel>Tinted capsule</FieldLabel>
				<InputGroup
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
				>
					<SwiftUIImage
						color={theme.colors.mutedForeground}
						size={16}
						systemName="person.2"
					/>
					<Input accessibilityLabel="Glass household name" text={text} />
					<SwiftUIButton onPress={() => text.set("")}>
						<SwiftUIImage
							color={theme.colors.mutedForeground}
							size={16}
							systemName="xmark.circle.fill"
						/>
					</SwiftUIButton>
				</InputGroup>
			</Field>
		</GlassStoryBackdrop>
	);
}

function SearchInputGroup() {
	const { theme } = useUnistyles();

	return (
		<InputGroup>
			<SwiftUIImage
				color={theme.colors.mutedForeground}
				size={16}
				systemName="magnifyingglass"
			/>
			<Input accessibilityLabel="Search Items" placeholder="Search Items" />
		</InputGroup>
	);
}

function ClearableInputGroup() {
	const { theme } = useUnistyles();
	const text = useNativeState("Golden Pantry");

	return (
		<Field>
			<FieldLabel>Household name</FieldLabel>
			<InputGroup>
				<SwiftUIImage
					color={theme.colors.mutedForeground}
					size={16}
					systemName="person.2"
				/>
				<Input accessibilityLabel="Household name" text={text} />
				<SwiftUIButton onPress={() => text.set("")}>
					<SwiftUIImage
						color={theme.colors.mutedForeground}
						size={16}
						systemName="xmark.circle.fill"
					/>
				</SwiftUIButton>
			</InputGroup>
			<FieldDescription>
				The trailing SwiftUI Button clears the native text state.
			</FieldDescription>
		</Field>
	);
}

function EmailInputGroup() {
	const { theme } = useUnistyles();

	return (
		<InputGroup>
			<SwiftUIImage
				color={theme.colors.mutedForeground}
				size={16}
				systemName="envelope"
			/>
			<Input
				accessibilityLabel="Email"
				defaultValue="not-an-email"
				modifiers={[keyboardType("email-address")]}
			/>
		</InputGroup>
	);
}

function DisabledInputGroup() {
	const { theme } = useUnistyles();

	return (
		<InputGroup>
			<SwiftUIImage
				color={theme.colors.mutedForeground}
				size={16}
				systemName="person.2"
			/>
			<Input accessibilityLabel="Household" defaultValue="Golden Pantry" />
		</InputGroup>
	);
}
