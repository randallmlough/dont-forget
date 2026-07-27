import type { Meta, StoryObj } from "@storybook/react-native";
import { type ReactNode, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ScopedTheme, StyleSheet } from "react-native-unistyles";

import { Button } from "./button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./card";
import { Item, ItemContent, ItemGroup, ItemMedia, ItemSeparator } from "./item";
import { Skeleton } from "./skeleton";

const meta = {
	title: "UI/Skeleton",
	component: Skeleton,
} satisfies Meta<typeof Skeleton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
	render: () => (
		<View style={styles.playground}>
			<Skeleton style={styles.playgroundSkeleton} />
		</View>
	),
};

export const ContentStates: Story = {
	render: () => (
		<ScopedTheme name="light">
			<ContentStateExample />
		</ScopedTheme>
	),
};

export const LightTheme: Story = {
	render: () => <SkeletonGallery themeName="light" />,
};

export const DarkTheme: Story = {
	render: () => <SkeletonGallery themeName="dark" />,
};

function ContentStateExample() {
	const [loading, setLoading] = useState(true);

	return (
		<View style={styles.stateCanvas}>
			{loading ? <ListSummaryLoading /> : <ListSummary />}
			<Button onPress={() => setLoading((current) => !current)}>
				{loading ? "Show loaded content" : "Show loading state"}
			</Button>
		</View>
	);
}

function SkeletonGallery({ themeName }: { themeName: "light" | "dark" }) {
	return (
		<ScopedTheme name={themeName}>
			<ScrollView contentContainerStyle={styles.canvas} style={styles.screen}>
				<StorySection title="Text">
					<View
						accessibilityLabel="Loading text"
						accessibilityRole="progressbar"
						accessibilityState={{ busy: true }}
						style={styles.textBlock}
					>
						<Skeleton style={styles.headingLine} />
						<Skeleton style={styles.textLine} />
						<Skeleton style={styles.textLine} />
						<Skeleton style={styles.shortTextLine} />
					</View>
				</StorySection>

				<StorySection title="Avatar and card">
					<Card
						accessibilityLabel="Loading Member profile"
						accessibilityRole="progressbar"
						accessibilityState={{ busy: true }}
					>
						<CardHeader style={styles.profileHeader}>
							<Skeleton style={styles.avatar} />
							<View style={styles.profileText}>
								<Skeleton style={styles.profileName} />
								<Skeleton style={styles.profileDetail} />
							</View>
						</CardHeader>
						<CardContent>
							<Skeleton style={styles.cardImage} />
						</CardContent>
					</Card>
				</StorySection>

				<StorySection title="Form">
					<View
						accessibilityLabel="Loading form"
						accessibilityRole="progressbar"
						accessibilityState={{ busy: true }}
						style={styles.form}
					>
						<LoadingField />
						<LoadingField />
						<Skeleton style={styles.formAction} />
					</View>
				</StorySection>

				<StorySection title="Household Lists">
					<ListRowsLoading />
				</StorySection>

				<StorySection title="Household Members">
					<MemberRowsLoading />
				</StorySection>
			</ScrollView>
		</ScopedTheme>
	);
}

function ListSummaryLoading() {
	return (
		<Card
			accessibilityLabel="Loading List summary"
			accessibilityRole="progressbar"
			accessibilityState={{ busy: true }}
		>
			<CardHeader style={styles.summaryHeader}>
				<Skeleton style={styles.summaryTitle} />
				<Skeleton style={styles.summaryDescription} />
			</CardHeader>
			<CardContent>
				<Skeleton style={styles.summaryBody} />
			</CardContent>
		</Card>
	);
}

function ListSummary() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Weekly groceries</CardTitle>
				<CardDescription>
					Everyone in Golden Pantry can collaborate on this List.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Text style={styles.summaryText}>8 Items remaining</Text>
			</CardContent>
		</Card>
	);
}

function LoadingField() {
	return (
		<View style={styles.field}>
			<Skeleton style={styles.fieldLabel} />
			<Skeleton style={styles.fieldInput} />
		</View>
	);
}

function ListRowsLoading() {
	return (
		<ItemGroup
			accessibilityLabel="Loading Lists"
			accessibilityRole="progressbar"
			accessibilityState={{ busy: true }}
			variant="outline"
		>
			<LoadingListRow />
			<ItemSeparator />
			<LoadingListRow />
			<ItemSeparator />
			<LoadingListRow />
		</ItemGroup>
	);
}

function LoadingListRow() {
	return (
		<Item size="sm">
			<ItemMedia variant="icon">
				<Skeleton style={styles.listIcon} />
			</ItemMedia>
			<ItemContent style={styles.rowContent}>
				<Skeleton style={styles.rowTitle} />
				<Skeleton style={styles.rowDetail} />
			</ItemContent>
		</Item>
	);
}

function MemberRowsLoading() {
	return (
		<ItemGroup
			accessibilityLabel="Loading Members"
			accessibilityRole="progressbar"
			accessibilityState={{ busy: true }}
			variant="outline"
		>
			<LoadingMemberRow />
			<ItemSeparator />
			<LoadingMemberRow />
			<ItemSeparator />
			<LoadingMemberRow />
		</ItemGroup>
	);
}

function LoadingMemberRow() {
	return (
		<Item size="sm">
			<ItemMedia>
				<Skeleton style={styles.memberAvatar} />
			</ItemMedia>
			<ItemContent style={styles.rowContent}>
				<Skeleton style={styles.memberName} />
				<Skeleton style={styles.memberRole} />
			</ItemContent>
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
		<View style={styles.section}>
			<Text style={styles.sectionTitle}>{title}</Text>
			{children}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	screen: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	canvas: {
		gap: theme.spacing(8),
		padding: theme.spacing(6),
	},
	playground: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: theme.spacing(6),
		backgroundColor: theme.colors.background,
	},
	playgroundSkeleton: {
		width: "70%",
		height: theme.spacing(5),
	},
	stateCanvas: {
		flex: 1,
		justifyContent: "center",
		gap: theme.spacing(4),
		padding: theme.spacing(6),
		backgroundColor: theme.colors.background,
	},
	section: {
		gap: theme.spacing(3),
	},
	sectionTitle: {
		...theme.typography.headline,
		color: theme.colors.foreground,
	},
	textBlock: {
		gap: theme.spacing(2),
	},
	headingLine: {
		width: "45%",
		height: theme.spacing(6),
	},
	textLine: {
		width: "100%",
		height: theme.spacing(4),
	},
	shortTextLine: {
		width: "70%",
		height: theme.spacing(4),
	},
	profileHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(4),
	},
	avatar: {
		width: theme.spacing(12),
		height: theme.spacing(12),
		borderRadius: theme.radii.full,
	},
	profileText: {
		flex: 1,
		gap: theme.spacing(2),
	},
	profileName: {
		width: "55%",
		height: theme.spacing(4),
	},
	profileDetail: {
		width: "35%",
		height: theme.spacing(3),
	},
	cardImage: {
		width: "100%",
		height: theme.spacing(32),
		borderRadius: theme.radii.lg,
	},
	form: {
		gap: theme.spacing(4),
	},
	field: {
		gap: theme.spacing(2),
	},
	fieldLabel: {
		width: "30%",
		height: theme.spacing(4),
	},
	fieldInput: {
		width: "100%",
		height: theme.spacing(11),
	},
	formAction: {
		width: "40%",
		height: theme.spacing(11),
	},
	summaryHeader: {
		gap: theme.spacing(2),
	},
	summaryTitle: {
		width: "52%",
		height: theme.spacing(5),
	},
	summaryDescription: {
		width: "88%",
		height: theme.spacing(4),
	},
	summaryBody: {
		width: "38%",
		height: theme.spacing(4),
	},
	summaryText: {
		...theme.typography.body,
		color: theme.colors.cardForeground,
	},
	listIcon: {
		width: theme.spacing(5),
		height: theme.spacing(5),
	},
	rowContent: {
		gap: theme.spacing(2),
	},
	rowTitle: {
		width: "68%",
		height: theme.spacing(4),
	},
	rowDetail: {
		width: "42%",
		height: theme.spacing(3),
	},
	memberAvatar: {
		width: theme.spacing(10),
		height: theme.spacing(10),
		borderRadius: theme.radii.full,
	},
	memberName: {
		width: "55%",
		height: theme.spacing(4),
	},
	memberRole: {
		width: "24%",
		height: theme.spacing(3),
	},
}));
