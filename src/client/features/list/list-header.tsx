import { SymbolView } from "expo-symbols";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { ListSummary } from "./list-service";
import type {
	ActiveListMeta,
	ActiveListState,
	ActiveListSyncState,
} from "./list-view-types";

export type ListHeaderProps = {
	currentListId?: string;
	state: ActiveListState;
	meta: ActiveListMeta;
	listSummaries?: ListSummary[];
	onOpenNavigation?: () => void;
	onSelectList?: (listId: string) => void;
	onPressListName?: () => void;
};

export function ListHeader({
	currentListId,
	state,
	meta,
	listSummaries = [],
	onOpenNavigation,
	onSelectList,
	onPressListName,
}: ListHeaderProps) {
	const { theme } = useUnistyles();
	const itemCount = state.items.length;
	const checkedCount = state.items.filter((item) => item.checked).length;
	const progress = itemCount === 0 ? 0 : (checkedCount / itemCount) * 100;
	const progressLabel =
		itemCount === 0
			? "No Items yet"
			: `${checkedCount} of ${itemCount} Items checked`;
	const quickLists = quickListOptions(
		state.listName,
		currentListId,
		listSummaries,
	);

	return (
		<View style={styles.header}>
			{onOpenNavigation ? (
				<Pressable
					accessibilityLabel="Open navigation"
					accessibilityRole="button"
					onPress={onOpenNavigation}
					style={({ pressed }) => [
						styles.menuButton,
						pressed ? styles.pressed : undefined,
					]}
				>
					<SymbolView
						name="line.3.horizontal"
						size={22}
						tintColor={theme.colors.text}
						weight="medium"
					/>
				</Pressable>
			) : null}
			<Text style={styles.householdName}>
				{state.householdName.toUpperCase()}
			</Text>
			{onPressListName ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Switch List"
					accessibilityHint="Opens the List switcher"
					onPress={onPressListName}
					style={({ pressed }) => [
						styles.listNameButton,
						pressed ? styles.pressed : undefined,
					]}
				>
					<Text style={styles.listName}>{state.listName}</Text>
					<SymbolView
						name="chevron.down"
						size={16}
						tintColor={theme.colors.text}
						weight="semibold"
					/>
				</Pressable>
			) : (
				<Text style={styles.listName}>{state.listName}</Text>
			)}
			<View style={styles.quickLists}>
				{quickLists.map((list) => {
					const selected = list.id
						? list.id === currentListId
						: list.name === state.listName;
					return (
						<Pressable
							key={list.id ?? `current:${list.name}`}
							accessibilityRole="button"
							accessibilityState={{ selected }}
							disabled={selected || !list.id || !onSelectList}
							onPress={() => {
								if (list.id) onSelectList?.(list.id);
							}}
							style={({ pressed }) => [
								styles.quickList,
								selected ? styles.quickListSelected : undefined,
								pressed ? styles.pressed : undefined,
							]}
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
						</Pressable>
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
	header: {
		paddingHorizontal: theme.spacing(5),
		paddingTop: theme.spacing(2),
		paddingBottom: theme.spacing(4.5),
		gap: theme.spacing(2),
		backgroundColor: theme.colors.background,
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	menuButton: {
		width: theme.spacing(11),
		height: theme.spacing(11),
		marginLeft: -theme.spacing(2.5),
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.radii.pill,
	},
	householdName: {
		color: theme.colors.textMuted,
		fontSize: theme.fontSizes.caption,
		fontWeight: theme.fontWeights.semibold,
		letterSpacing: 1.5,
	},
	listNameButton: {
		alignSelf: "flex-start",
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(2),
	},
	listName: {
		...theme.typography.largeTitle,
		color: theme.colors.text,
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
		borderRadius: theme.radii.pill,
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.border,
		backgroundColor: theme.colors.surface,
	},
	quickListSelected: {
		borderColor: theme.colors.primary,
		backgroundColor: theme.colors.primary,
	},
	quickListLabel: {
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
	},
	quickListLabelSelected: {
		color: theme.colors.inverseText,
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
		color: theme.colors.textMuted,
	},
	progressTrack: {
		height: theme.spacing(0.75),
		borderRadius: theme.radii.pill,
		overflow: "hidden",
		backgroundColor: theme.colors.border,
	},
	progressFill: {
		height: "100%",
		borderRadius: theme.radii.pill,
		backgroundColor: theme.colors.primary,
	},
	syncStatus: {
		...theme.typography.caption,
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
	pressed: {
		opacity: theme.opacities.pressed,
	},
}));
