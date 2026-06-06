import { Pressable, Text, View } from "react-native";
import type { ListSummary } from "@/lib/services/list";
import { formatRelativeDateLabel } from "@/lib/time/display";
import { styles } from "./list-switcher-styles";

export function ListSwitcherRow({
	actionsOpen,
	canRenameLists,
	currentListId,
	isArchivedRow,
	isRenaming,
	isSwitching,
	list,
	onSelectList,
	onStartArchive,
	onStartDelete,
	onStartRename,
	onUnarchiveList,
	onToggleActions,
}: {
	actionsOpen: boolean;
	canRenameLists: boolean;
	currentListId: string | null;
	isArchivedRow: boolean;
	isRenaming: boolean;
	isSwitching: boolean;
	list: ListSummary;
	onSelectList: (listId: string) => void;
	onStartArchive?: (list: ListSummary) => void;
	onStartDelete?: (list: ListSummary) => void;
	onStartRename: (list: ListSummary) => void;
	onUnarchiveList?: (list: ListSummary) => void;
	onToggleActions: (list: ListSummary) => void;
}) {
	const isCurrent = list.id === currentListId;
	const countLabel = `${list.uncheckedItemCount} unchecked, ${list.checkedItemCount} checked`;
	const activityLabel = `Updated ${formatRelativeDateLabel(list.lastActivityAt)}`;
	const rowAccessibilityLabel = isArchivedRow
		? `${list.name}, archived List, ${countLabel}, ${activityLabel}`
		: isCurrent
			? `${list.name}, current List, ${countLabel}, ${activityLabel}`
			: `${list.name}, ${countLabel}, ${activityLabel}`;

	return (
		<View style={styles.rowGroup}>
			<View style={[styles.row, isCurrent ? styles.currentRow : undefined]}>
				<Pressable
					accessibilityHint={
						isArchivedRow ? undefined : "Switches to this List"
					}
					accessibilityLabel={rowAccessibilityLabel}
					accessibilityRole="button"
					accessibilityState={
						isSwitching || isArchivedRow
							? {
									disabled: true,
									selected: isCurrent,
								}
							: { selected: isCurrent }
					}
					disabled={isSwitching || isArchivedRow}
					onPress={() => {
						if (!isArchivedRow) onSelectList(list.id);
					}}
					style={({ pressed }) => [
						styles.rowMain,
						isSwitching || isArchivedRow ? styles.disabledRow : undefined,
						pressed ? styles.pressed : undefined,
					]}
				>
					<Text ellipsizeMode="tail" style={styles.rowName} numberOfLines={2}>
						{list.name}
					</Text>
					<View style={styles.rowMeta}>
						<Text style={styles.rowMetaText}>
							{list.uncheckedItemCount} unchecked · {list.checkedItemCount}{" "}
							checked
						</Text>
						<Text style={styles.rowMetaText}>
							Updated {formatRelativeDateLabel(list.lastActivityAt)}
						</Text>
					</View>
					{isCurrent ? (
						<Text style={styles.currentLabel}>Current List</Text>
					) : null}
				</Pressable>
				{canRenameLists ||
				onStartArchive ||
				onUnarchiveList ||
				onStartDelete ? (
					<Pressable
						accessibilityLabel={`List actions for ${list.name}`}
						accessibilityRole="button"
						disabled={isSwitching || isRenaming}
						onPress={() => onToggleActions(list)}
						style={({ pressed }) => [
							styles.rowAction,
							isSwitching || isRenaming ? styles.disabledRow : undefined,
							pressed ? styles.pressed : undefined,
						]}
					>
						<Text style={styles.rowActionLabel}>...</Text>
					</Pressable>
				) : null}
			</View>
			{actionsOpen ? (
				<View style={styles.rowActionMenu}>
					{canRenameLists ? (
						<Pressable
							accessibilityRole="button"
							accessibilityHint={`Renames ${list.name}`}
							disabled={isRenaming}
							onPress={() => onStartRename(list)}
							style={({ pressed }) => [
								styles.menuAction,
								pressed ? styles.pressed : undefined,
							]}
						>
							<Text style={styles.menuActionLabel}>Rename</Text>
						</Pressable>
					) : null}
					{isArchivedRow && onUnarchiveList ? (
						<Pressable
							accessibilityRole="button"
							accessibilityHint={`Restores ${list.name} to active Lists`}
							disabled={isSwitching}
							onPress={() => onUnarchiveList(list)}
							style={({ pressed }) => [
								styles.menuAction,
								pressed ? styles.pressed : undefined,
							]}
						>
							<Text style={styles.menuActionLabel}>Unarchive</Text>
						</Pressable>
					) : null}
					{!isArchivedRow && onStartArchive ? (
						<Pressable
							accessibilityRole="button"
							accessibilityHint={`Moves ${list.name} to Archived Lists`}
							disabled={isSwitching}
							onPress={() => onStartArchive(list)}
							style={({ pressed }) => [
								styles.menuAction,
								pressed ? styles.pressed : undefined,
							]}
						>
							<Text style={styles.menuActionLabel}>Archive</Text>
						</Pressable>
					) : null}
					{onStartDelete ? (
						<Pressable
							accessibilityRole="button"
							accessibilityHint={`Deletes ${list.name}`}
							disabled={isSwitching}
							onPress={() => onStartDelete(list)}
							style={({ pressed }) => [
								styles.menuAction,
								pressed ? styles.pressed : undefined,
							]}
						>
							<Text style={styles.destructiveMenuActionLabel}>Delete</Text>
						</Pressable>
					) : null}
				</View>
			) : null}
		</View>
	);
}
