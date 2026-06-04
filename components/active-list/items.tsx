import {
	FlatList,
	type ListRenderItemInfo,
	Pressable,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { useActiveList } from "./context";
import type { ActiveListItem } from "./types";

const COMPOSER_SCROLL_CLEARANCE = 128;

export function ActiveListItems() {
	const { state } = useActiveList();
	const insets = useSafeAreaInsets();

	return (
		<FlatList
			data={state.items}
			keyExtractor={keyExtractor}
			renderItem={renderItem}
			ItemSeparatorComponent={ItemSeparator}
			ListEmptyComponent={EmptyList}
			keyboardShouldPersistTaps="handled"
			contentContainerStyle={[
				styles.itemsContent,
				{ paddingBottom: insets.bottom + COMPOSER_SCROLL_CLEARANCE },
				state.items.length === 0 ? styles.emptyItemsContent : undefined,
			]}
		/>
	);
}

function ItemRow({ item }: { item: ActiveListItem }) {
	const { actions } = useActiveList();
	const detailText = itemDetailText(item);

	function toggle() {
		void actions.toggleItem(item.id);
	}

	return (
		<Pressable
			accessibilityRole="checkbox"
			accessibilityState={{ checked: item.checked }}
			onPress={toggle}
			style={({ pressed }) => [
				styles.itemRow,
				pressed ? styles.itemRowPressed : undefined,
			]}
		>
			<View
				style={[
					styles.checkbox,
					item.checked ? styles.checkboxChecked : undefined,
				]}
			>
				{item.checked ? <View style={styles.checkboxMark} /> : null}
			</View>
			<View style={styles.itemTextGroup}>
				<Text
					style={[
						styles.itemName,
						item.checked ? styles.itemNameChecked : undefined,
					]}
				>
					{item.name}
				</Text>
				{detailText ? <Text style={styles.itemMeta}>{detailText}</Text> : null}
				{item.checkedByMemberName ? (
					<Text style={styles.itemMeta}>
						Checked by {item.checkedByMemberName}
					</Text>
				) : null}
			</View>
		</Pressable>
	);
}

function EmptyList() {
	return (
		<View style={styles.emptyState}>
			<Text style={styles.emptyTitle}>This List is empty.</Text>
			<Text style={styles.emptyBody}>
				Add the first Item for your Household.
			</Text>
		</View>
	);
}

function ItemSeparator() {
	return <View style={styles.itemSeparator} />;
}

function keyExtractor(item: ActiveListItem) {
	return item.id;
}

function renderItem({ item }: ListRenderItemInfo<ActiveListItem>) {
	return <ItemRow item={item} />;
}

function itemDetailText(item: ActiveListItem): string | null {
	const parts = [item.quantity, item.notes].filter((part) => part);
	return parts.length > 0 ? parts.join(" - ") : null;
}

const styles = StyleSheet.create((theme) => ({
	itemsContent: {
		padding: theme.spacing(5),
	},
	emptyItemsContent: {
		flexGrow: 1,
		justifyContent: "center",
	},
	emptyState: {
		alignItems: "center",
		gap: theme.spacing(2),
		padding: theme.spacing(7),
		borderRadius: theme.radii.card,
		borderCurve: "continuous",
		backgroundColor: theme.colors.surface,
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.border,
	},
	emptyTitle: {
		fontSize: theme.fontSizes.titleSmall,
		fontWeight: theme.fontWeights.bold,
		color: theme.colors.text,
		textAlign: "center",
	},
	emptyBody: {
		...theme.typography.callout,
		color: theme.colors.textMuted,
		textAlign: "center",
	},
	itemRow: {
		minHeight: theme.spacing(16),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		padding: theme.spacing(3.5),
		borderRadius: theme.radii.card,
		borderCurve: "continuous",
		backgroundColor: theme.colors.surface,
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.border,
	},
	itemRowPressed: {
		opacity: theme.opacities.pressed,
	},
	checkbox: {
		width: theme.spacing(6),
		height: theme.spacing(6),
		borderRadius: theme.radii.checkbox,
		borderCurve: "continuous",
		borderWidth: theme.borders.thick,
		borderColor: theme.colors.textSubtle,
		alignItems: "center",
		justifyContent: "center",
	},
	checkboxChecked: {
		borderColor: theme.colors.primary,
		backgroundColor: theme.colors.primary,
	},
	checkboxMark: {
		width: theme.spacing(2.5),
		height: theme.spacing(2.5),
		borderRadius: theme.radii.checkboxMark,
		backgroundColor: theme.colors.inverseText,
	},
	itemTextGroup: {
		flex: 1,
		minWidth: 0,
	},
	itemName: {
		color: theme.colors.text,
		fontSize: theme.fontSizes.subheadline,
		fontWeight: theme.fontWeights.semibold,
	},
	itemNameChecked: {
		color: theme.colors.textMuted,
		textDecorationLine: "line-through",
	},
	itemMeta: {
		...theme.typography.caption,
		color: theme.colors.textSubtle,
		marginTop: theme.spacing(0.5),
	},
	itemSeparator: {
		height: theme.spacing(2.5),
	},
}));
