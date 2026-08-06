import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
	ActiveListMeta,
	ActiveListState,
	ActiveListSyncState,
} from "./list-view-types";

export type ListOverviewProps = {
	state: ActiveListState;
	meta: ActiveListMeta;
};

export function ListOverview({ state, meta }: ListOverviewProps) {
	const itemCount = state.items.length;
	const checkedCount = state.items.filter((item) => item.checked).length;
	const progress = itemCount === 0 ? 0 : (checkedCount / itemCount) * 100;
	const progressLabel =
		itemCount === 0
			? "No Items yet"
			: `${checkedCount} of ${itemCount} Items checked`;

	return (
		<View style={styles.overview}>
			<View style={styles.progressMeta}>
				<Text style={styles.progressLabel}>{progressLabel}</Text>
				<Text style={[styles.syncStatus, syncStatusStyle(meta.syncState)]}>
					{syncStatusLabel(meta.syncState)}
				</Text>
			</View>
			<View style={styles.progressTrack}>
				<View style={[styles.progressFill, { width: `${progress}%` }]} />
			</View>
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
	overview: {
		paddingHorizontal: theme.spacing(5),
		paddingTop: theme.spacing(3),
		paddingBottom: theme.spacing(4.5),
		gap: theme.spacing(2),
		backgroundColor: theme.colors.background,
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	progressMeta: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: theme.spacing(3),
		paddingTop: theme.spacing(1),
	},
	progressLabel: {
		...theme.typography.callout,
		color: theme.colors.mutedForeground,
	},
	progressTrack: {
		height: theme.spacing(0.75),
		borderRadius: theme.radii.full,
		overflow: "hidden",
		backgroundColor: theme.colors.border,
	},
	progressFill: {
		height: "100%",
		borderRadius: theme.radii.full,
		backgroundColor: theme.colors.primary,
	},
	syncStatus: {
		...theme.typography.caption,
		color: theme.colors.mutedForeground,
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
}));
