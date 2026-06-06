import { Pressable, Text, View } from "react-native";
import { styles } from "./list-switcher-styles";
import type { ListSwitcherSegment } from "./list-switcher-types";

export function ListSwitcherEmptyState({
	hasArchivedLists,
	onCreateList,
	onViewArchived,
	searchText,
	segment,
}: {
	hasArchivedLists: boolean;
	onCreateList: () => void;
	onViewArchived: () => void;
	searchText: string;
	segment: ListSwitcherSegment;
}) {
	const hasSearch = searchText.trim().length > 0;
	const title =
		segment === "active"
			? hasSearch
				? "No matching Lists"
				: "No active Lists"
			: hasSearch
				? "No matching archived Lists"
				: "No archived Lists";

	return (
		<View style={styles.emptyState}>
			<Text style={styles.emptyStateTitle}>{title}</Text>
			{segment === "active" && !hasSearch ? (
				<View style={styles.emptyStateActions}>
					<Pressable
						accessibilityRole="button"
						onPress={onCreateList}
						style={({ pressed }) => [
							styles.primaryButton,
							pressed ? styles.pressed : undefined,
						]}
					>
						<Text style={styles.primaryButtonLabel}>Create List</Text>
					</Pressable>
					{hasArchivedLists ? (
						<Pressable
							accessibilityRole="button"
							onPress={onViewArchived}
							style={({ pressed }) => [
								styles.secondaryButton,
								pressed ? styles.pressed : undefined,
							]}
						>
							<Text style={styles.secondaryButtonLabel}>View Archived</Text>
						</Pressable>
					) : null}
				</View>
			) : null}
		</View>
	);
}
