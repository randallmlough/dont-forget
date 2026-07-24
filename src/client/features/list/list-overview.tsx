import { useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/client/ui/button";
import type { ListSummary } from "./list-service";
import type {
	ActiveListMeta,
	ActiveListState,
	ActiveListSyncState,
} from "./list-view-types";

export type ListOverviewProps = {
	currentListId?: string;
	state: ActiveListState;
	meta: ActiveListMeta;
	listSummaries?: ListSummary[];
	onSelectList?: (listId: string) => void;
};

export function ListOverview({
	currentListId,
	state,
	meta,
	listSummaries = [],
	onSelectList,
}: ListOverviewProps) {
	const itemCount = state.items.length;
	const checkedCount = state.items.filter((item) => item.checked).length;
	const progress = itemCount === 0 ? 0 : (checkedCount / itemCount) * 100;
	const progressLabel =
		itemCount === 0
			? "No Items yet"
			: `${checkedCount} of ${itemCount} Items checked`;
	// Item toggles re-render the overview; only List changes rebuild the chips.
	const quickLists = useMemo(
		() => quickListOptions(state.listName, currentListId, listSummaries),
		[state.listName, currentListId, listSummaries],
	);

	return (
		<View style={styles.overview}>
			<View style={styles.quickLists}>
				{quickLists.map((list) => {
					const selected = list.id
						? list.id === currentListId
						: list.name === state.listName;
					return (
						<Button
							key={list.id ?? `current:${list.name}`}
							accessibilityState={{ selected }}
							disabled={selected || !list.id || !onSelectList}
							onPress={() => {
								if (list.id) onSelectList?.(list.id);
							}}
							style={[
								styles.quickList,
								selected ? styles.quickListSelected : undefined,
							]}
							variant="link"
						>
							<Text
								numberOfLines={1}
								style={[
									styles.quickListLabel,
									selected ? styles.quickListLabelSelected : undefined,
								]}
							>
								{list.name}
							</Text>
						</Button>
					);
				})}
			</View>
			<View style={styles.progressMeta}>
				<Text style={styles.progressLabel}>{progressLabel}</Text>
				<Text style={[styles.syncStatus, syncStatusStyle(meta.syncState)]}>
					{syncStatusLabel(meta.syncState)}
				</Text>
			</View>
			<View style={styles.progressTrack}>
				<View style={[styles.progressFill, { width: `${progress}%` }]} />
			</View>
			{meta.errorMessage ? (
				<Text style={styles.errorMessage}>{meta.errorMessage}</Text>
			) : null}
		</View>
	);
}

function quickListOptions(
	currentListName: string,
	currentListId: string | undefined,
	summaries: ListSummary[],
): { id: string | null; name: string }[] {
	const currentSummary = summaries.find(
		(summary) => summary.id === currentListId,
	);
	const current = {
		id: currentSummary?.id ?? currentListId ?? null,
		name: currentSummary?.name ?? currentListName,
	};
	const alternatives = summaries
		.filter((summary) => summary.id !== currentListId)
		.map((summary) => ({ id: summary.id, name: summary.name }));

	return [current, ...alternatives].slice(0, 3);
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
	quickLists: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(2),
		paddingTop: theme.spacing(1),
	},
	quickList: {
		minWidth: theme.spacing(20),
		maxWidth: theme.spacing(30),
		minHeight: theme.spacing(8),
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: theme.spacing(3),
		borderRadius: theme.radii.full,
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.border,
		backgroundColor: theme.colors.card,
	},
	quickListSelected: {
		borderColor: theme.colors.primary,
		backgroundColor: theme.colors.primary,
	},
	quickListLabel: {
		...theme.typography.captionStrong,
		color: theme.colors.mutedForeground,
	},
	quickListLabelSelected: {
		color: theme.colors.primaryForeground,
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
	errorMessage: {
		fontSize: theme.fontSizes.sm,
		fontWeight: theme.fontWeights.semibold,
		marginTop: theme.spacing(2),
		color: theme.colors.destructive,
	},
}));
