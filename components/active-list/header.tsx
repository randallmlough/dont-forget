import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useActiveList } from "./context";
import type { ActiveListSyncState } from "./types";

export type ActiveListHeaderProps = {
	onPressCurrentList?: () => void;
};

export function ActiveListHeader({
	onPressCurrentList,
}: ActiveListHeaderProps) {
	const { actions, meta, state } = useActiveList();
	const itemCount = state.items.length;
	const checkedCount = state.items.filter((item) => item.checked).length;
	const progressLabel =
		itemCount === 0
			? "No Items yet"
			: `${checkedCount} of ${itemCount} Items checked`;
	const listDetails = (
		<>
			<Text style={styles.listName}>{state.listName}</Text>
			<Text style={styles.progressLabel}>{progressLabel}</Text>
		</>
	);

	return (
		<View style={styles.header}>
			<View style={styles.headerTopRow}>
				<Text style={styles.householdName}>{state.householdName}</Text>
				<Pressable
					accessibilityRole="button"
					accessibilityState={{ busy: meta.isRefreshing }}
					onPress={() => void actions.refresh()}
					style={({ pressed }) => [
						styles.refreshButton,
						pressed ? styles.refreshButtonPressed : undefined,
					]}
				>
					<Text style={styles.refreshButtonLabel}>
						{meta.isRefreshing ? "Refreshing" : "Refresh"}
					</Text>
				</Pressable>
			</View>
			{onPressCurrentList ? (
				<Pressable
					accessibilityLabel={`Current List ${state.listName}`}
					accessibilityRole="button"
					onPress={onPressCurrentList}
					style={({ pressed }) => [
						styles.listButton,
						pressed ? styles.listButtonPressed : undefined,
					]}
				>
					{listDetails}
				</Pressable>
			) : (
				listDetails
			)}
			<Text style={[styles.syncStatus, syncStatusStyle(meta.syncState)]}>
				{syncStatusLabel(meta.syncState)}
			</Text>
			{meta.errorMessage ? (
				<Text style={styles.errorMessage}>{meta.errorMessage}</Text>
			) : null}
		</View>
	);
}

function syncStatusLabel(syncState: ActiveListSyncState): string {
	switch (syncState) {
		case "synced":
			return "Synced";
		case "pending":
			return "Pending sync";
		case "offline":
			return "Offline - changes saved locally";
		case "failed":
			return "Sync failed - changes saved locally";
	}
}

function syncStatusStyle(syncState: ActiveListSyncState) {
	switch (syncState) {
		case "synced":
			return styles.syncStatusSynced;
		case "pending":
			return styles.syncStatusPending;
		case "failed":
			return styles.syncStatusFailed;
		case "offline":
			return undefined;
	}
}

const styles = StyleSheet.create((theme) => ({
	header: {
		paddingHorizontal: theme.spacing(5),
		paddingTop: theme.spacing(5),
		paddingBottom: theme.spacing(4),
		gap: theme.spacing(1),
		backgroundColor: theme.colors.surface,
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	headerTopRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: theme.spacing(3),
	},
	householdName: {
		flex: 1,
		color: theme.colors.textMuted,
		fontSize: theme.fontSizes.footnote,
		fontWeight: theme.fontWeights.semibold,
	},
	refreshButton: {
		minHeight: theme.spacing(11),
		paddingHorizontal: theme.spacing(2.5),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.background,
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.border,
	},
	refreshButtonPressed: {
		opacity: theme.opacities.pressed,
	},
	refreshButtonLabel: {
		...theme.typography.caption,
		color: theme.colors.text,
		fontWeight: theme.fontWeights.bold,
	},
	listButton: {
		alignItems: "flex-start",
		gap: theme.spacing(1),
	},
	listButtonPressed: {
		opacity: theme.opacities.pressed,
	},
	listName: {
		...theme.typography.largeTitle,
		color: theme.colors.text,
	},
	progressLabel: {
		...theme.typography.callout,
		color: theme.colors.textMuted,
	},
	syncStatus: {
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
	},
	syncStatusSynced: {
		color: theme.colors.primary,
	},
	syncStatusPending: {
		color: theme.colors.link,
	},
	syncStatusFailed: {
		color: theme.colors.destructive,
	},
	errorMessage: {
		fontSize: theme.fontSizes.footnote,
		fontWeight: theme.fontWeights.semibold,
		marginTop: theme.spacing(2),
		color: theme.colors.destructive,
	},
}));
