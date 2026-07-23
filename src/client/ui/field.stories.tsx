import type { Meta, StoryObj } from "@storybook/react-native";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSeparator,
	FieldSet,
	FieldSetSummary,
} from "./field";
import {
	FormStoryCanvas,
	FormStorySection,
	type FormStoryTheme,
} from "./form-story-layout";
import { Input } from "./input";

const meta = {
	title: "UI/Field",
	component: Field,
} satisfies Meta<typeof Field>;

export default meta;

type Story = StoryObj<typeof meta>;

export const LightTheme: Story = {
	render: () => <FieldGallery themeName="light" />,
};

export const DarkTheme: Story = {
	render: () => <FieldGallery themeName="dark" />,
};

function FieldGallery({ themeName }: { themeName: FormStoryTheme }) {
	return (
		<FormStoryCanvas themeName={themeName}>
			<FormStorySection
				description="A Field composes its label, control, helper text, and validation state."
				title="Anatomy"
			>
				<Field required>
					<FieldLabel>List name</FieldLabel>
					<Input
						accessibilityLabel="List name"
						placeholder="Weekly groceries"
					/>
					<FieldDescription>
						Members see this name when they switch Lists.
					</FieldDescription>
				</Field>
				<Field invalid>
					<FieldLabel>Email address</FieldLabel>
					<Input
						accessibilityLabel="Email address"
						defaultValue="not-an-email"
						kind="email"
					/>
					<FieldError>Enter a valid email address.</FieldError>
				</Field>
			</FormStorySection>

			<FormStorySection
				description="FieldSet and FieldGroup organize related controls without owning their values or validation library."
				title="Grouped fields"
			>
				<FieldSet>
					<FieldSetSummary>
						<FieldLegend>Household details</FieldLegend>
						<FieldDescription>
							This information is visible to every Member.
						</FieldDescription>
					</FieldSetSummary>
					<FieldGroup>
						<Field>
							<FieldLabel>Household name</FieldLabel>
							<Input
								accessibilityLabel="Household name"
								defaultValue="Golden Pantry"
							/>
						</Field>
						<FieldSeparator>Optional</FieldSeparator>
						<Field>
							<FieldLabel>Invitation note</FieldLabel>
							<Input
								accessibilityLabel="Invitation note"
								axis="vertical"
								placeholder="Add a short welcome message"
							/>
						</Field>
					</FieldGroup>
				</FieldSet>
			</FormStorySection>

			<FormStorySection
				description="Horizontal fields pair a leading label with control details in FieldContent."
				title="Horizontal composition"
			>
				<Field orientation="horizontal">
					<FieldLabel>Join code</FieldLabel>
					<FieldContent>
						<Input
							accessibilityLabel="Household join code"
							defaultValue="ABC-123"
						/>
						<FieldDescription>
							Share this reusable code with another Member.
						</FieldDescription>
					</FieldContent>
				</Field>
			</FormStorySection>

			<FormStorySection
				description="FieldError accepts direct content or deduplicates a list of error messages."
				title="Multiple errors"
			>
				<Field invalid>
					<FieldLabel>Passphrase</FieldLabel>
					<Input accessibilityLabel="Passphrase" secureTextEntry />
					<FieldError
						errors={[
							"Use at least eight characters.",
							"Add a number or symbol.",
							"Use at least eight characters.",
						]}
					/>
				</Field>
			</FormStorySection>
		</FormStoryCanvas>
	);
}
