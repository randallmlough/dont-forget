import { Pressable, Text, View } from "react-native";
import { useActiveList } from "./context";
import { activeListStyles as styles } from "./styles";
import type { ActiveListSyncState } from "./types";

export function ActiveListHeader() {
	const { actions, meta, state } = useActiveList();
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
			<Text style={styles.listName}>{state.listName}</Text>
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
