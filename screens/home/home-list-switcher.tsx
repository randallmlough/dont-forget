import { useCallback, useRef } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	Text,
	View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { track } from "@/lib/analytics";
import { setCurrentListSelection } from "@/lib/local-storage/current-list-selection";
import type { ListSummary } from "@/lib/services/list";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { HomeListSwitcherSheet } from "./home-list-switcher-sheet";
import { useHomeListSwitcherRows } from "./use-home-list-switcher-rows";

/**
 * Home-owned active List switcher. Mounted only while open.
 *
 * Selecting a non-current row persists the explicit local Current List
 * selection, emits `list_switched` only after persistence succeeds, hands
 * control back to the task 5 resolver path via `onSwitched` (re-resolution
 * reads the stored selection and remounts the Active List boundary), and
 * closes the sheet. A current-row tap is a complete no-op.
 */
export function HomeListSwitcher({
	session,
	currentListId,
	onDismiss,
	onSwitched,
}: {
	session: AuthenticatedAppSession;
	currentListId: string;
	onDismiss: () => void;
	onSwitched: () => void;
}) {
	const { rows, reload } = useHomeListSwitcherRows(session);
	const switchingRef = useRef(false);

	const selectList = useCallback(
		async (listId: string) => {
			// Current row tap: no persistence, no analytics, sheet stays open.
			if (listId === currentListId) return;
			if (switchingRef.current) return;
			switchingRef.current = true;
			try {
				await setCurrentListSelection(
					session.activeMember.userId,
					session.activeHousehold.id,
					listId,
				);
			} catch {
				// Persistence failed: emit nothing, change nothing, keep the sheet
				// open so the User can try the row again.
				switchingRef.current = false;
				return;
			}
			// Only after the local selection persisted: the explicit switch boundary.
			track("list_switched", {
				household_id: session.activeHousehold.id,
				list_id: listId,
				user_id: session.activeMember.userId,
			});
			onSwitched();
			onDismiss();
		},
		[currentListId, onDismiss, onSwitched, session],
	);

	return (
		<HomeListSwitcherSheet onDismiss={onDismiss}>
			<View style={styles.sheetContent}>
				<Text style={styles.title}>Switch List</Text>
				{rows.status === "loading" ? (
					<View style={styles.statusContainer}>
						<ActivityIndicator />
					</View>
				) : rows.status === "error" ? (
					<View style={styles.statusContainer}>
						<Text style={styles.errorMessage}>
							Unable to load your Lists. Please try again.
						</Text>
						<Pressable
							accessibilityRole="button"
							onPress={() => void reload()}
							style={({ pressed }) => [
								styles.retryButton,
								pressed ? styles.pressed : undefined,
							]}
						>
							<Text style={styles.retryLabel}>Try again</Text>
						</Pressable>
					</View>
				) : (
					<ScrollView alwaysBounceVertical={false} style={styles.rowsScroll}>
						{rows.summaries.map((summary) => (
							<HomeListSwitcherRow
								key={summary.id}
								summary={summary}
								isCurrent={summary.id === currentListId}
								onPress={() => void selectList(summary.id)}
							/>
						))}
					</ScrollView>
				)}
			</View>
		</HomeListSwitcherSheet>
	);
}

function HomeListSwitcherRow({
	summary,
	isCurrent,
	onPress,
}: {
	summary: ListSummary;
	isCurrent: boolean;
	onPress: () => void;
}) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={summary.name}
			accessibilityState={{ selected: isCurrent }}
			onPress={onPress}
			style={({ pressed }) => [
				styles.row,
				pressed ? styles.pressed : undefined,
			]}
		>
			<View style={styles.rowTextGroup}>
				<Text style={styles.rowName} numberOfLines={1}>
					{summary.name}
				</Text>
				<Text style={styles.rowCounts}>
					{summary.uncheckedItemCount} unchecked · {summary.checkedItemCount}{" "}
					checked
				</Text>
			</View>
			{isCurrent ? <Text style={styles.currentBadge}>Current</Text> : null}
		</Pressable>
	);
}

const styles = StyleSheet.create((theme) => ({
	sheetContent: {
		flex: 1,
		paddingHorizontal: theme.spacing(5),
		paddingTop: theme.spacing(5),
		paddingBottom: theme.spacing(4),
		gap: theme.spacing(3),
		backgroundColor: theme.colors.surface,
	},
	title: {
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
	},
	statusContainer: {
		alignItems: "center",
		gap: theme.spacing(3),
		paddingVertical: theme.spacing(6),
	},
	errorMessage: {
		...theme.typography.callout,
		color: theme.colors.destructive,
		textAlign: "center",
	},
	retryButton: {
		minHeight: theme.spacing(11),
		paddingHorizontal: theme.spacing(3.5),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		alignItems: "center",
		justifyContent: "center",
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		backgroundColor: theme.colors.surface,
	},
	rowsScroll: {
		// A ScrollView with auto height lays out at full content height and never
		// scrolls; flex: 1 bounds it to the remaining detent space inside the
		// sheet so overflowing rows scroll within the detent.
		flex: 1,
	},
	retryLabel: {
		...theme.typography.callout,
		color: theme.colors.text,
		fontWeight: theme.fontWeights.bold,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: theme.spacing(3),
		minHeight: theme.spacing(13),
		paddingVertical: theme.spacing(2.5),
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	rowTextGroup: {
		flex: 1,
		minWidth: 0,
		gap: theme.spacing(0.5),
	},
	rowName: {
		...theme.typography.headline,
		color: theme.colors.text,
	},
	rowCounts: {
		...theme.typography.caption,
		color: theme.colors.textMuted,
	},
	currentBadge: {
		...theme.typography.captionStrong,
		color: theme.colors.primary,
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
}));
