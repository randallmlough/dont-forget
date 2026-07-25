import { SymbolView } from "expo-symbols";
import {
	memo,
	type ReactElement,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from "react";
import {
	FlatList,
	type ListRenderItemInfo,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	Pressable,
	Text,
	View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { ActiveListItem } from "./list-view-types";

export type ItemRowsProps = {
	items: ActiveListItem[];
	listOverview?: ReactElement;
	bottomContentInset?: number;
	focused?: boolean;
	onPressBlankSpace?: () => void;
	onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
	topContentInset?: number;
	onToggleItem: (itemId: string) => void;
	testID?: string;
};

export function ItemRows({
	items,
	listOverview,
	bottomContentInset = 0,
	focused,
	onPressBlankSpace,
	onScroll,
	topContentInset,
	onToggleItem,
	testID,
}: ItemRowsProps) {
	const listRef = useRef<FlatList<ActiveListItem>>(null);
	const initialResetPendingRef = useRef(focused !== undefined);
	const scrollIndicatorInsets = useMemo(
		() =>
			topContentInset === undefined ? undefined : { top: topContentInset },
		[topContentInset],
	);
	const renderItem = useCallback(
		({ item }: ListRenderItemInfo<ActiveListItem>) => (
			<ItemRow item={item} onToggle={onToggleItem} />
		),
		[onToggleItem],
	);
	const renderEmpty = useCallback(
		() => <EmptyList onPress={onPressBlankSpace} />,
		[onPressBlankSpace],
	);
	const resetScrollPosition = useCallback(() => {
		listRef.current?.scrollToOffset({
			animated: false,
			offset: 0,
		});
	}, []);

	useEffect(() => {
		if (focused === undefined) return;
		resetScrollPosition();
	}, [focused, resetScrollPosition]);

	function contentSizeChanged() {
		if (!initialResetPendingRef.current) return;
		initialResetPendingRef.current = false;
		resetScrollPosition();
	}

	return (
		<FlatList
			data={items}
			keyExtractor={keyExtractor}
			renderItem={renderItem}
			ItemSeparatorComponent={ItemSeparator}
			ListEmptyComponent={renderEmpty}
			ListFooterComponent={
				onPressBlankSpace ? (
					<Pressable
						accessibilityHint="Opens the add Item composer"
						accessibilityLabel="Add Item"
						accessibilityRole="button"
						onPress={onPressBlankSpace}
						style={styles.blankSpace}
					/>
				) : null
			}
			ListFooterComponentStyle={
				onPressBlankSpace ? styles.blankSpaceContainer : undefined
			}
			ListHeaderComponent={listOverview}
			keyboardShouldPersistTaps="handled"
			// Home supplies an explicit inset because iOS only automatically adjusts
			// one of the nested pager Lists. Other surfaces keep native adjustment.
			contentInsetAdjustmentBehavior={
				topContentInset === undefined ? "automatic" : "never"
			}
			ref={listRef}
			scrollEventThrottle={onScroll ? 16 : undefined}
			scrollIndicatorInsets={scrollIndicatorInsets}
			style={styles.list}
			testID={testID}
			onContentSizeChange={contentSizeChanged}
			onScroll={onScroll}
			contentContainerStyle={[
				styles.itemsContent,
				{
					paddingTop: topContentInset,
					paddingBottom: bottomContentInset,
				},
			]}
		/>
	);
}

function ItemRowComponent({
	item,
	onToggle,
}: {
	item: ActiveListItem;
	onToggle: (id: string) => void;
}) {
	const { theme } = useUnistyles();
	const detailText = itemDetailText(item);

	function toggle() {
		onToggle(item.id);
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
				{item.checked ? (
					<SymbolView
						name="checkmark"
						size={14}
						tintColor={theme.colors.primaryForeground}
						weight="bold"
					/>
				) : null}
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

const ItemRow = memo(ItemRowComponent);

function EmptyList({ onPress }: { onPress?: () => void }) {
	if (onPress) {
		return (
			<Pressable
				accessibilityHint="Opens the add Item composer"
				accessibilityLabel="Add the first Item"
				accessibilityRole="button"
				onPress={onPress}
				style={styles.emptyState}
			>
				<EmptyListContent />
			</Pressable>
		);
	}

	return (
		<View style={styles.emptyState}>
			<EmptyListContent />
		</View>
	);
}

function EmptyListContent() {
	return (
		<>
			<Text style={styles.emptyTitle}>This List is empty.</Text>
			<Text style={styles.emptyBody}>
				Add the first Item for your Household.
			</Text>
		</>
	);
}

function ItemSeparator() {
	return <View style={styles.itemSeparator} />;
}

function keyExtractor(item: ActiveListItem) {
	return item.id;
}

function itemDetailText(item: ActiveListItem): string | null {
	const parts = [item.quantity, item.notes].filter((part) => part);
	return parts.length > 0 ? parts.join(" - ") : null;
}

const styles = StyleSheet.create((theme) => ({
	list: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	itemsContent: {
		flexGrow: 1,
		paddingBottom: theme.spacing(2),
	},
	blankSpace: {
		flex: 1,
		minHeight: theme.spacing(16),
	},
	blankSpaceContainer: {
		flexGrow: 1,
		minHeight: theme.spacing(16),
	},
	emptyState: {
		alignItems: "center",
		gap: theme.spacing(2),
		padding: theme.spacing(8),
	},
	emptyTitle: {
		fontSize: theme.fontSizes.lg,
		fontWeight: theme.fontWeights.bold,
		color: theme.colors.foreground,
		textAlign: "center",
	},
	emptyBody: {
		...theme.typography.callout,
		color: theme.colors.mutedForeground,
		textAlign: "center",
	},
	itemRow: {
		minHeight: theme.spacing(17),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(5),
		paddingVertical: theme.spacing(2.5),
	},
	itemRowPressed: {
		opacity: theme.opacities.pressed,
	},
	checkbox: {
		width: theme.spacing(6),
		height: theme.spacing(6),
		borderRadius: theme.radii.lg,
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.subtleForeground,
		alignItems: "center",
		justifyContent: "center",
	},
	checkboxChecked: {
		borderColor: theme.colors.primary,
		backgroundColor: theme.colors.primary,
	},
	itemTextGroup: {
		flex: 1,
		minWidth: 0,
	},
	itemName: {
		color: theme.colors.foreground,
		fontFamily: theme.fontFamilies.serif,
		fontSize: theme.fontSizes.lg,
	},
	itemNameChecked: {
		color: theme.colors.mutedForeground,
		textDecorationLine: "line-through",
	},
	itemMeta: {
		...theme.typography.caption,
		color: theme.colors.subtleForeground,
		marginTop: theme.spacing(0.5),
	},
	itemSeparator: {
		height: theme.borders.hairline,
		marginLeft: theme.spacing(14),
		marginRight: theme.spacing(5),
		backgroundColor: theme.colors.border,
	},
}));
