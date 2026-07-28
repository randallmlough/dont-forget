import {
	type ReactElement,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from "react";
import {
	type FlatList,
	type ListRenderItemInfo,
	Pressable,
	Text,
	type TextInput as TextInputInstance,
	View,
} from "react-native";
import Animated, {
	type SharedValue,
	useAnimatedScrollHandler,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ItemDetailsSheet } from "@/client/features/item/item-details-sheet";
import type { ItemEditorInlinePresentation } from "@/client/features/item/item-editor-reducer";
import { ItemInlineForm } from "@/client/features/item/item-inline-form";
import { ItemRow } from "@/client/features/item/item-row";
import type { ActiveListItem } from "@/client/features/item/item-view-types";
import type { ItemEditor } from "@/client/features/item/use-item-editor";
import { ItemSeparator } from "@/client/ui/item";

type NewItemDraftRow = {
	kind: "newItemDraft";
	id: string;
};

type ItemListRow = ActiveListItem | NewItemDraftRow;

export type ListItemsProps = {
	items: ActiveListItem[];
	editor: ItemEditor;
	listOverview?: ReactElement;
	bottomContentInset?: number;
	focused?: boolean;
	/** Receives the vertical scroll offset so callers can animate on the UI thread. */
	scrollOffsetY?: SharedValue<number>;
	topContentInset?: number;
	testID?: string;
};

export function ListItems({
	items,
	editor,
	listOverview,
	bottomContentInset = 0,
	focused,
	scrollOffsetY,
	topContentInset,
	testID,
}: ListItemsProps) {
	const { theme } = useUnistyles();
	const listRef = useRef<FlatList<ItemListRow>>(null);
	const inlineNameInputRef = useRef<TextInputInstance>(null);
	const initialResetPendingRef = useRef(focused !== undefined);
	const { actions } = editor;
	const activeInline = editor.inline;
	const editorBottomClearance = activeInline ? theme.spacing(15) : 0;
	const rows = useMemo(
		() => itemListRows(items, activeInline),
		[activeInline, items],
	);
	const activeInlineIndex = activeInline
		? rows.findIndex((row) => isActiveInlineRow(row, activeInline))
		: -1;
	const activeInlineKey = activeInline
		? inlinePresentationKey(activeInline)
		: null;
	const scrollIndicatorInsets = useMemo(
		() =>
			topContentInset === undefined ? undefined : { top: topContentInset },
		[topContentInset],
	);
	const editItem = useCallback(
		(itemId: string) => {
			void actions.startEditing(itemId);
		},
		[actions],
	);
	const toggleItem = useCallback(
		(itemId: string) => {
			void actions.toggleItem(itemId);
		},
		[actions],
	);
	const renderItem = useCallback(
		({ item }: ListRenderItemInfo<ItemListRow>) => {
			if (activeInline && isActiveInlineRow(item, activeInline)) {
				const draftRow = isNewItemDraftRow(item);
				return (
					<ItemInlineForm
						checked={draftRow ? false : item.checked}
						mode={activeInline.sourceKind}
						name={activeInline.draft.name}
						notes={activeInline.draft.notes}
						noteVisible={activeInline.noteVisible}
						saving={activeInline.saving}
						nameInputRef={inlineNameInputRef}
						onBlurEditor={(refocus) => {
							void actions.blurInlineEditor(refocus);
						}}
						onChangeName={actions.changeName}
						onChangeNotes={actions.changeNotes}
						onOpenDetails={actions.openDetails}
						onShowNote={actions.showNote}
						onSubmitTitle={() => {
							void actions.submitTitle();
						}}
						onToggleItem={
							draftRow ? () => undefined : () => toggleItem(item.id)
						}
					/>
				);
			}

			if (isNewItemDraftRow(item)) return null;

			return (
				<ItemRow
					checked={item.checked}
					checkedByMemberName={item.checkedByMemberName}
					id={item.id}
					name={item.name}
					notes={item.notes}
					quantity={item.quantity}
					onEditItem={editItem}
					onToggleItem={toggleItem}
				/>
			);
		},
		[activeInline, actions, editItem, toggleItem],
	);
	const renderEmpty = useCallback(() => <EmptyList />, []);
	const scrollHandler = useAnimatedScrollHandler((event) => {
		scrollOffsetY?.set(event.contentOffset.y);
	});
	const resetScrollPosition = useCallback(() => {
		listRef.current?.scrollToOffset({
			animated: false,
			offset: 0,
		});
		scrollOffsetY?.set(0);
	}, [scrollOffsetY]);

	useEffect(() => {
		if (focused === undefined) return;
		resetScrollPosition();
	}, [focused, resetScrollPosition]);

	useEffect(() => {
		if (activeInlineKey === null || activeInlineIndex < 0) return;
		const frame = requestAnimationFrame(() => {
			listRef.current?.scrollToIndex({
				animated: true,
				index: activeInlineIndex,
				viewPosition: 0.5,
			});
		});
		return () => cancelAnimationFrame(frame);
	}, [activeInlineIndex, activeInlineKey]);

	function contentSizeChanged() {
		if (!initialResetPendingRef.current) return;
		initialResetPendingRef.current = false;
		resetScrollPosition();
	}

	function dismissInlineEditor() {
		void actions.blurInlineEditor(() => undefined);
	}

	return (
		<>
			<Animated.FlatList
				automaticallyAdjustKeyboardInsets
				data={rows}
				keyExtractor={keyExtractor}
				renderItem={renderItem}
				ItemSeparatorComponent={RowSeparator}
				ListEmptyComponent={renderEmpty}
				ListFooterComponent={
					activeInline ? (
						<Pressable
							accessible={false}
							style={styles.backgroundDismissTarget}
							testID="list-background-dismiss-target"
							onPress={dismissInlineEditor}
						/>
					) : undefined
				}
				ListFooterComponentStyle={styles.footer}
				ListHeaderComponent={
					activeInline && listOverview ? (
						<Pressable
							accessible={false}
							testID="list-overview-dismiss-target"
							onPress={dismissInlineEditor}
						>
							{listOverview}
						</Pressable>
					) : (
						listOverview
					)
				}
				keyboardDismissMode="interactive"
				keyboardShouldPersistTaps="handled"
				contentInsetAdjustmentBehavior={
					topContentInset === undefined ? "automatic" : "never"
				}
				ref={listRef}
				scrollEventThrottle={16}
				scrollIndicatorInsets={scrollIndicatorInsets}
				style={styles.list}
				testID={testID}
				onContentSizeChange={contentSizeChanged}
				onScroll={scrollHandler}
				onScrollToIndexFailed={(info) => {
					listRef.current?.scrollToOffset({
						animated: true,
						offset: info.averageItemLength * info.index,
					});
				}}
				contentContainerStyle={[
					styles.itemsContent,
					styles.contentInsets(
						topContentInset ?? 0,
						bottomContentInset + editorBottomClearance,
					),
				]}
			/>
			<ItemDetailsSheet
				editor={editor}
				onReturnToInline={() => inlineNameInputRef.current?.focus()}
			/>
		</>
	);
}

function itemListRows(
	items: readonly ActiveListItem[],
	activeInline: ItemEditorInlinePresentation | null,
): ItemListRow[] {
	if (activeInline?.sourceKind !== "new") return [...items];

	const draft: NewItemDraftRow = {
		kind: "newItemDraft",
		id: `new-item-draft-${activeInline.draftKey}`,
	};
	const firstCheckedIndex = items.findIndex((item) => item.checked);
	if (firstCheckedIndex < 0) return [...items, draft];
	return [
		...items.slice(0, firstCheckedIndex),
		draft,
		...items.slice(firstCheckedIndex),
	];
}

function isNewItemDraftRow(row: ItemListRow): row is NewItemDraftRow {
	return "kind" in row && row.kind === "newItemDraft";
}

function isActiveInlineRow(
	row: ItemListRow,
	activeInline: ItemEditorInlinePresentation,
): boolean {
	if (activeInline.sourceKind === "new") return isNewItemDraftRow(row);
	return !isNewItemDraftRow(row) && row.id === activeInline.itemId;
}

function inlinePresentationKey(
	activeInline: ItemEditorInlinePresentation,
): string {
	return activeInline.sourceKind === "new"
		? `new:${activeInline.draftKey}`
		: `existing:${activeInline.itemId}`;
}

function keyExtractor(row: ItemListRow): string {
	return row.id;
}

function EmptyList() {
	return (
		<View style={styles.emptyState}>
			<Text style={styles.emptyBody}>Tap + to add an Item.</Text>
		</View>
	);
}

function RowSeparator() {
	return <ItemSeparator style={styles.itemSeparator} />;
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
	backgroundDismissTarget: {
		minHeight: theme.spacing(11),
		flex: 1,
	},
	footer: {
		flexGrow: 1,
	},
	contentInsets: (top: number, bottom: number) => ({
		paddingTop: top,
		paddingBottom: bottom,
	}),
	emptyState: {
		alignItems: "center",
		gap: theme.spacing(2),
		padding: theme.spacing(8),
	},
	emptyBody: {
		...theme.typography.callout,
		color: theme.colors.mutedForeground,
		textAlign: "center",
	},
	itemSeparator: {
		marginLeft: theme.spacing(14),
		marginRight: theme.spacing(5),
	},
}));
