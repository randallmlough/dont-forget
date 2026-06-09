import { BottomSheet, Group, RNHostView } from "@expo/ui/swift-ui";
import {
	presentationDetents,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	Text,
	View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";

import type { ListSummary } from "@/lib/services/list";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { HomeRetryButton, HomeStatus } from "./home-status";
import { useHomeListSwitcher } from "./use-home-list-switcher";

export type HomeListSwitcherSheetProps = {
	currentListId: string;
	isPresented: boolean;
	onIsPresentedChange: (isPresented: boolean) => void;
	onListSelected: (listId: string) => void;
	session: AuthenticatedAppSession;
};

export function HomeListSwitcherSheet({
	currentListId,
	isPresented,
	onIsPresentedChange,
	onListSelected,
	session,
}: HomeListSwitcherSheetProps) {
	const switcher = useHomeListSwitcher({
		currentListId,
		isPresented,
		onIsPresentedChange,
		onListSelected,
		session,
	});

	return (
		<BottomSheet
			isPresented={isPresented}
			onIsPresentedChange={onIsPresentedChange}
		>
			<Group
				modifiers={[
					presentationDetents(["medium", "large"]),
					presentationDragIndicator("visible"),
				]}
			>
				<RNHostView>
					<View style={styles.sheet}>
						{switcher.state.status === "loading" ? (
							<HomeStatus title="Loading Lists" body="Preparing active Lists.">
								<ActivityIndicator />
							</HomeStatus>
						) : switcher.state.status === "error" ? (
							<HomeStatus
								title="Lists unavailable"
								body="Unable to load active Lists. Please try again."
							>
								<HomeRetryButton onPress={switcher.retry} />
							</HomeStatus>
						) : (
							<ScrollView
								contentContainerStyle={styles.listContent}
								style={styles.list}
							>
								{switcher.state.summaries.map((summary) => (
									<ListSwitcherRow
										current={summary.id === currentListId}
										key={summary.id}
										onPress={switcher.selectList}
										summary={summary}
										switching={switcher.switchingListId === summary.id}
									/>
								))}
							</ScrollView>
						)}
					</View>
				</RNHostView>
			</Group>
		</BottomSheet>
	);
}

function ListSwitcherRow({
	current,
	onPress,
	summary,
	switching,
}: {
	current: boolean;
	onPress: (listId: string) => void;
	summary: ListSummary;
	switching: boolean;
}) {
	return (
		<Pressable
			accessibilityLabel={listSwitcherRowLabel(summary, current)}
			accessibilityRole="button"
			accessibilityState={{ selected: current, busy: switching }}
			onPress={() => onPress(summary.id)}
			style={({ pressed }) => [
				styles.row,
				current ? styles.currentRow : undefined,
				pressed ? styles.rowPressed : undefined,
			]}
		>
			<View style={styles.rowTitleGroup}>
				<Text numberOfLines={1} style={styles.rowName}>
					{summary.name}
				</Text>
				{current ? <Text style={styles.currentIndicator}>Current</Text> : null}
			</View>
			<View style={styles.countGroup}>
				<Text style={styles.countText}>
					{summary.uncheckedItemCount} unchecked
				</Text>
				<Text style={styles.countText}>{summary.checkedItemCount} checked</Text>
			</View>
		</Pressable>
	);
}

function listSwitcherRowLabel(summary: ListSummary, current: boolean): string {
	const currentLabel = current ? ", current" : "";
	return `${summary.name}, ${summary.uncheckedItemCount} unchecked, ${summary.checkedItemCount} checked${currentLabel}`;
}

const styles = StyleSheet.create((theme) => ({
	sheet: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	list: {
		flex: 1,
	},
	listContent: {
		paddingHorizontal: theme.spacing(5),
		paddingVertical: theme.spacing(4),
		gap: theme.spacing(2),
	},
	row: {
		minHeight: theme.spacing(18),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		backgroundColor: theme.colors.surface,
		paddingHorizontal: theme.spacing(4),
		paddingVertical: theme.spacing(3),
		gap: theme.spacing(2),
	},
	currentRow: {
		borderColor: theme.colors.primary,
	},
	rowPressed: {
		opacity: theme.opacities.pressed,
	},
	rowTitleGroup: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: theme.spacing(3),
	},
	rowName: {
		flex: 1,
		color: theme.colors.text,
		fontSize: theme.fontSizes.headline,
		fontWeight: theme.fontWeights.bold,
	},
	currentIndicator: {
		...theme.typography.captionStrong,
		color: theme.colors.primary,
	},
	countGroup: {
		flexDirection: "row",
		gap: theme.spacing(3),
	},
	countText: {
		...theme.typography.caption,
		color: theme.colors.textMuted,
	},
}));
