import type { Meta, StoryObj } from "@storybook/react-native";
import { type ReactNode, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { BottomSheet, type BottomSheetSnapPoint } from "./bottom-sheet";
import { Button } from "./button";

const meta = {
	title: "UI/Bottom Sheet",
	component: BottomSheet,
	excludeStories: ["BottomSheetStory"],
	args: {
		children: null,
		header: { title: "Bottom Sheet" },
		isPresented: false,
		onIsPresentedChange: noop,
	},
	parameters: {
		controls: { disable: true },
	},
} satisfies Meta<typeof BottomSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

export const CompactHeader: Story = {
	render: () => (
		<BottomSheetStory snapPoints={[{ height: 300 }]} title="About shared Lists">
			<View style={styles.summary}>
				<Text style={styles.eyebrow}>One List, everyone in sync</Text>
				<Text style={styles.body}>
					Every Member of your Household can add Items, check them off, and see
					changes as they arrive.
				</Text>
			</View>
		</BottomSheetStory>
	),
};

export const HalfHeightWithAction: Story = {
	render: () => (
		<BottomSheetStory
			actionLabel="Done"
			snapPoints={["half"]}
			title="Choose a List"
		>
			<ScrollView
				contentContainerStyle={styles.listContent}
				nestedScrollEnabled
				style={styles.scroll}
			>
				{listNames.map((name, index) => (
					<View key={name} style={styles.row}>
						<View style={styles.rowCopy}>
							<Text style={styles.rowTitle}>{name}</Text>
							<Text style={styles.rowDetail}>{index + 2} unchecked Items</Text>
						</View>
						<Text style={styles.rowAccessory}>
							{index === 0 ? "Selected" : "›"}
						</Text>
					</View>
				))}
			</ScrollView>
		</BottomSheetStory>
	),
};

export const HalfAndFullHeightForm: Story = {
	render: () => (
		<BottomSheetStory
			actionLabel="Save"
			snapPoints={["half", "full"]}
			title="Add Item details"
		>
			<ScrollView
				contentContainerStyle={styles.form}
				keyboardShouldPersistTaps="handled"
				nestedScrollEnabled
				style={styles.scroll}
			>
				<LabeledInput label="Item name" placeholder="Heirloom tomatoes" />
				<LabeledInput label="Quantity" placeholder="2 pints" />
				<LabeledInput
					label="Notes"
					multiline
					placeholder="The small orange ones, if available"
				/>
				<View style={styles.tip}>
					<Text style={styles.tipTitle}>Shared with your Household</Text>
					<Text style={styles.body}>
						Changes are saved locally first, so Members can keep editing while
						offline.
					</Text>
				</View>
			</ScrollView>
		</BottomSheetStory>
	),
};

export const FullHeightHeader: Story = {
	render: () => (
		<BottomSheetStory snapPoints={["full"]} title="Household Members">
			<ScrollView
				contentContainerStyle={styles.listContent}
				nestedScrollEnabled
				style={styles.scroll}
			>
				{members.map((member) => (
					<View key={member.name} style={styles.member}>
						<View style={styles.avatar}>
							<Text style={styles.avatarLabel}>{member.initials}</Text>
						</View>
						<View style={styles.rowCopy}>
							<Text style={styles.rowTitle}>{member.name}</Text>
							<Text style={styles.rowDetail}>{member.role}</Text>
						</View>
					</View>
				))}
				<View style={styles.emptyState}>
					<Text style={styles.emptyTitle}>Everyone is here</Text>
					<Text style={styles.body}>
						Send an Invitation when another Member needs access to your
						Household’s Lists.
					</Text>
				</View>
			</ScrollView>
		</BottomSheetStory>
	),
};

type BottomSheetStoryProps = {
	actionLabel?: string;
	children: ReactNode;
	snapPoints: BottomSheetSnapPoint[];
	title: string;
};

export function BottomSheetStory({
	actionLabel,
	children,
	snapPoints,
	title,
}: BottomSheetStoryProps) {
	const [isPresented, setIsPresented] = useState(true);

	return (
		<View style={styles.canvas}>
			<Button onPress={() => setIsPresented(true)}>{`Open ${title}`}</Button>
			<BottomSheet
				header={{
					title,
					trailingAction:
						actionLabel !== undefined ? (
							<Button
								onPress={() => setIsPresented(false)}
								size="sm"
								variant="ghost"
							>
								{actionLabel}
							</Button>
						) : undefined,
				}}
				isPresented={isPresented}
				onIsPresentedChange={setIsPresented}
				snapPoints={snapPoints}
			>
				{children}
			</BottomSheet>
		</View>
	);
}

function LabeledInput({
	label,
	multiline = false,
	placeholder,
}: {
	label: string;
	multiline?: boolean;
	placeholder: string;
}) {
	return (
		<View style={styles.field}>
			<Text style={styles.label}>{label}</Text>
			<TextInput
				accessibilityLabel={label}
				multiline={multiline}
				placeholder={placeholder}
				style={[styles.input, multiline ? styles.multilineInput : null]}
			/>
		</View>
	);
}

const listNames = [
	"Weekly groceries",
	"Farmers market",
	"Hardware store",
	"Camping weekend",
	"Pantry restock",
	"Birthday dinner",
	"Pharmacy",
	"Garden center",
	"Beach day",
	"School supplies",
];

const members = [
	{ initials: "AC", name: "Avery Chen", role: "Owner" },
	{ initials: "JM", name: "Jordan Morgan", role: "Member" },
	{ initials: "RS", name: "Riley Singh", role: "Member" },
	{ initials: "TK", name: "Taylor Kim", role: "Member" },
	{ initials: "MP", name: "Morgan Patel", role: "Member" },
];

function noop() {}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: theme.spacing(6),
	},
	summary: {
		gap: theme.spacing(2),
		padding: theme.spacing(4),
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		borderRadius: theme.radii.xl,
	},
	eyebrow: {
		...theme.typography.captionStrong,
		color: theme.colors.primary,
		textTransform: "uppercase",
	},
	body: {
		...theme.typography.body,
		color: theme.colors.mutedForeground,
	},
	scroll: {
		flex: 1,
	},
	listContent: {
		gap: theme.spacing(2),
		paddingBottom: theme.spacing(6),
	},
	row: {
		minHeight: theme.spacing(15),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(4),
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		borderRadius: theme.radii.lg,
	},
	rowCopy: {
		minWidth: 0,
		flex: 1,
	},
	rowTitle: {
		...theme.typography.body,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.cardForeground,
	},
	rowDetail: {
		...theme.typography.caption,
		color: theme.colors.mutedForeground,
	},
	rowAccessory: {
		...theme.typography.callout,
		color: theme.colors.mutedForeground,
	},
	form: {
		gap: theme.spacing(4),
		paddingBottom: theme.spacing(8),
	},
	field: {
		gap: theme.spacing(2),
	},
	label: {
		...theme.typography.captionStrong,
		color: theme.colors.foreground,
	},
	input: {
		minHeight: theme.spacing(12),
		paddingHorizontal: theme.spacing(4),
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.input,
		borderRadius: theme.radii.lg,
		color: theme.colors.cardForeground,
	},
	multilineInput: {
		minHeight: theme.spacing(24),
		paddingTop: theme.spacing(3),
		textAlignVertical: "top",
	},
	tip: {
		gap: theme.spacing(1),
		padding: theme.spacing(4),
		borderRadius: theme.radii.lg,
	},
	tipTitle: {
		...theme.typography.callout,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.foreground,
	},
	member: {
		minHeight: theme.spacing(16),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(2),
	},
	avatar: {
		width: theme.spacing(11),
		height: theme.spacing(11),
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.radii.full,
	},
	avatarLabel: {
		...theme.typography.captionStrong,
		color: theme.colors.secondaryForeground,
	},
	emptyState: {
		alignItems: "center",
		gap: theme.spacing(2),
		padding: theme.spacing(6),
		borderRadius: theme.radii.xl,
	},
	emptyTitle: {
		...theme.typography.headline,
		color: theme.colors.foreground,
	},
}));
