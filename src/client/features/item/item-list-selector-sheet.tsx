import { SymbolView } from "expo-symbols";
import { FlatList, Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Badge } from "@/client/ui/badge";
import { BottomSheet } from "@/client/ui/bottom-sheet";
import { ButtonIconGlass } from "@/client/ui/button-icon-glass";
import { ItemSeparator } from "@/client/ui/item";
import type { ItemListOption } from "./item-view-types";

export type ItemListSelectorSheetProps = {
	isPresented: boolean;
	lists: readonly ItemListOption[];
	selectedListId: string;
	sourceListId: string | null;
	onClose: () => void;
	onSelectList: (listId: string) => void;
};

export function ItemListSelectorSheet({
	isPresented,
	lists,
	selectedListId,
	sourceListId,
	onClose,
	onSelectList,
}: ItemListSelectorSheetProps) {
	const { theme } = useUnistyles();

	return (
		<BottomSheet
			header={{
				title: "Choose a List",
				leadingAction: (
					<ButtonIconGlass
						accessibilityHint="Returns to Item Details"
						accessibilityLabel="Cancel List Selection"
						onPress={onClose}
						showTint={false}
						size="sm"
						systemImage="xmark"
					/>
				),
			}}
			isPresented={isPresented}
			onIsPresentedChange={(presented) => {
				if (!presented) onClose();
			}}
			showDragIndicator
			snapPoints={[{ fraction: 0.9 }]}
			testID="item-list-selector-sheet"
		>
			<FlatList
				data={lists}
				keyExtractor={listKey}
				nestedScrollEnabled
				renderItem={({ item }) => {
					const current = item.id === sourceListId;
					const selected = item.id === selectedListId;
					const accessibilitySuffix = [
						current ? "Current" : null,
						selected ? "Selected" : null,
					]
						.filter((value): value is string => value !== null)
						.join(", ");

					return (
						<Pressable
							accessibilityLabel={
								accessibilitySuffix
									? `${item.name}, ${accessibilitySuffix}`
									: item.name
							}
							accessibilityRole="radio"
							accessibilityState={{ selected }}
							onPress={() => onSelectList(item.id)}
							style={({ pressed }) => [
								styles.row,
								pressed ? styles.pressed : undefined,
							]}
						>
							<Text numberOfLines={1} style={styles.name}>
								{item.name}
							</Text>
							{current ? <Badge variant="secondary">Current</Badge> : null}
							{selected ? (
								<SymbolView
									name="checkmark"
									size={18}
									tintColor={theme.colors.primary}
									weight="semibold"
								/>
							) : (
								<View style={styles.checkPlaceholder} />
							)}
						</Pressable>
					);
				}}
				style={styles.list}
				ItemSeparatorComponent={ListSeparator}
			/>
		</BottomSheet>
	);
}

function listKey(list: ItemListOption): string {
	return list.id;
}

function ListSeparator() {
	return <ItemSeparator style={styles.separator} />;
}

const styles = StyleSheet.create((theme) => ({
	list: {
		flex: 1,
	},
	row: {
		minHeight: theme.spacing(14),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(5),
	},
	name: {
		...theme.typography.body,
		flex: 1,
		minWidth: 0,
		color: theme.colors.foreground,
	},
	checkPlaceholder: {
		width: theme.spacing(5),
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
	separator: {
		marginLeft: theme.spacing(5),
	},
}));
