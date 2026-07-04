import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
	ActiveListMeta,
	ActiveListState,
	ActiveListSyncState,
} from "./list-view-types";

export type ListHeaderProps = {
	state: ActiveListState;
	meta: ActiveListMeta;
	onPressListName?: () => void;
};

export function ListHeader({ state, meta, onPressListName }: ListHeaderProps) {
	const itemCount = state.items.length;
	const checkedCount = state.items.filter((item) => item.checked).length;
	const progressLabel =
		itemCount === 0
			? "No Items yet"
			: `${checkedCount} of ${itemCount} Items checked`;

	return (
		<View style={styles.header}>
			<View style={styles.headerTopRow}>
				<Text style={styles.householdName}>{state.householdName}</Text>
			</View>
			{onPressListName ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Switch List"
					accessibilityHint="Opens the List switcher"
					onPress={onPressListName}
					style={({ pressed }) =>
						pressed ? styles.listNamePressed : undefined
					}
				>
					<Text style={styles.listName}>{state.listName}</Text>
				</Pressable>
			) : (
				<Text style={styles.listName}>{state.listName}</Text>
			)}
			<Text style={styles.progressLabel}>{progressLabel}</Text>
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
	listName: {
		...theme.typography.largeTitle,
		color: theme.colors.text,
	},
	listNamePressed: {
		opacity: theme.opacities.pressed,
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
