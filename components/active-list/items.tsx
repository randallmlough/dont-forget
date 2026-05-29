import {
	FlatList,
	type ListRenderItemInfo,
	Pressable,
	Text,
	View,
} from "react-native";
import { useActiveList } from "./context";
import { activeListStyles as styles } from "./styles";
import type { ActiveListItem } from "./types";

export function ActiveListItems() {
	const { state } = useActiveList();

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
				state.items.length === 0 ? styles.emptyItemsContent : undefined,
			]}
		/>
	);
}

function ItemRow({ item }: { item: ActiveListItem }) {
	const { actions } = useActiveList();

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
