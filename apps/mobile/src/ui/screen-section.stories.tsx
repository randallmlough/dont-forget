import type { Meta, StoryObj } from "@storybook/react-native";
import { SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ScopedTheme, StyleSheet, useUnistyles } from "react-native-unistyles";

import { Badge } from "./badge";
import { Button } from "./button";
import {
	Item,
	ItemActions,
	ItemActionsLabel,
	ItemContent,
	ItemGroup,
	ItemSeparator,
	ItemTitle,
} from "./item";
import { ScreenSection } from "./screen-section";

const meta = {
	title: "UI/ScreenSection",
	component: ScreenSection,
	args: {
		title: "Household",
		detail: "3 Members",
	},
	argTypes: {
		action: { control: false },
		children: { control: false },
	},
} satisfies Meta<typeof ScreenSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
	render: (args) => (
		<View style={styles.playground}>
			<ScreenSection {...args}>
				<HouseholdList />
			</ScreenSection>
		</View>
	),
};

export const LightTheme: Story = {
	render: () => <ScreenSectionGallery themeName="light" />,
};

export const DarkTheme: Story = {
	render: () => <ScreenSectionGallery themeName="dark" />,
};

function ScreenSectionGallery({ themeName }: { themeName: "light" | "dark" }) {
	return (
		<ScopedTheme name={themeName}>
			<ScrollView contentContainerStyle={styles.canvas} style={styles.screen}>
				<StorySection title="Heading variations">
					<ScreenSection title="Household">
						<HouseholdList />
					</ScreenSection>

					<ScreenSection detail="3 Members" title="Household">
						<HouseholdList />
					</ScreenSection>
				</StorySection>

				<StorySection title="Action composition">
					<ScreenSection action={<EditAction />} title="Personal Information">
						<PersonalInformation />
					</ScreenSection>

					<ScreenSection action={<LinkAction />} title="Recent Lists">
						<RecentLists />
					</ScreenSection>

					<ScreenSection action={<IconAction />} title="Members">
						<HouseholdList />
					</ScreenSection>

					<ScreenSection
						action={<Badge variant="secondary">Owner</Badge>}
						title="Membership"
					>
						<MembershipDetails />
					</ScreenSection>
				</StorySection>
			</ScrollView>
		</ScopedTheme>
	);
}

function EditAction() {
	return (
		<Button
			onPress={noop}
			style={styles.textAction}
			textStyle={styles.textActionLabel}
			variant="ghost"
		>
			Edit
		</Button>
	);
}

function LinkAction() {
	return (
		<Pressable
			accessibilityRole="link"
			onPress={noop}
			style={({ pressed }) => [
				styles.linkAction,
				pressed ? styles.actionPressed : undefined,
			]}
		>
			<Text style={styles.linkActionLabel}>View All</Text>
		</Pressable>
	);
}

function IconAction() {
	const { theme } = useUnistyles();

	return (
		<Button
			accessibilityLabel="Add Member"
			onPress={noop}
			radius="full"
			size="icon"
			variant="ghost"
		>
			<SymbolView
				accessibilityElementsHidden
				accessible={false}
				name="person.badge.plus"
				size={theme.spacing(5)}
				tintColor={theme.colors.primary}
				weight="medium"
			/>
		</Button>
	);
}

function HouseholdList() {
	return (
		<ItemGroup variant="outline">
			<DetailItem label="Avery Chen" value="Owner" />
			<ItemSeparator />
			<DetailItem label="Jordan Lee" value="Member" />
			<ItemSeparator />
			<DetailItem label="Morgan Patel" value="Member" />
		</ItemGroup>
	);
}

function PersonalInformation() {
	return (
		<ItemGroup variant="outline">
			<DetailItem label="First Name" value="Avery" />
			<ItemSeparator />
			<DetailItem label="Last Name" value="Chen" />
		</ItemGroup>
	);
}

function RecentLists() {
	return (
		<ItemGroup variant="outline">
			<DetailItem label="Groceries" value="8 Items" />
			<ItemSeparator />
			<DetailItem label="Hardware Store" value="3 Items" />
		</ItemGroup>
	);
}

function MembershipDetails() {
	return (
		<ItemGroup variant="outline">
			<DetailItem label="Role" value="Owner" />
		</ItemGroup>
	);
}

function DetailItem({ label, value }: { label: string; value: string }) {
	return (
		<Item size="sm">
			<ItemContent>
				<ItemTitle>{label}</ItemTitle>
			</ItemContent>
			<ItemActions>
				<ItemActionsLabel>{value}</ItemActionsLabel>
			</ItemActions>
		</Item>
	);
}

function StorySection({
	children,
	title,
}: {
	children: ReactNode;
	title: string;
}) {
	return (
		<View style={styles.storySection}>
			<Text style={styles.storySectionTitle}>{title}</Text>
			{children}
		</View>
	);
}

function noop() {}

const styles = StyleSheet.create((theme) => ({
	screen: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	canvas: {
		gap: theme.spacing(8),
		padding: theme.spacing(5),
	},
	playground: {
		flex: 1,
		justifyContent: "center",
		padding: theme.spacing(5),
		backgroundColor: theme.colors.background,
	},
	storySection: {
		gap: theme.spacing(6),
	},
	storySectionTitle: {
		...theme.typography.headline,
		color: theme.colors.foreground,
	},
	textAction: {
		minHeight: theme.spacing(11),
		justifyContent: "center",
		paddingHorizontal: theme.spacing(2),
		marginVertical: -theme.spacing(2),
	},
	textActionLabel: {
		...theme.typography.callout,
		color: theme.colors.primary,
	},
	linkAction: {
		minHeight: theme.spacing(11),
		justifyContent: "center",
		paddingHorizontal: theme.spacing(2),
		marginVertical: -theme.spacing(2),
	},
	linkActionLabel: {
		...theme.typography.callout,
		color: theme.colors.link,
		textDecorationLine: "underline",
	},
	actionPressed: {
		opacity: theme.opacities.pressed,
	},
}));
