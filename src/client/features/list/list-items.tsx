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
	View,
} from "react-native";
import Animated, {
	type SharedValue,
	useAnimatedScrollHandler,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { ItemDetailsSheet } from "@/client/features/item/item-details-sheet";
import { ItemInlineForm } from "@/client/features/item/item-inline-form";
import { ItemRow } from "@/client/features/item/item-row";
import type {
	ActiveListItem,
	ItemDraftValues,
} from "@/client/features/item/item-view-types";
import type { ItemEditor } from "@/client/features/item/use-item-editor";

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
	const listRef = useRef<FlatList<ItemListRow>>(null);
	const initialResetPendingRef = useRef(focused !== undefined);
	const activeInline = inlinePresentation(editor);
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
	const renderItem = useCallback(
		({ item }: ListRenderItemInfo<ItemListRow>) => {
			if (isNewItemDraftRow(item)) {
				if (activeInline?.sourceKind !== "new") return null;
				return (
					<ItemInlineForm
						checked={false}
						mode="new"
						name={activeInline.draft.name}
						notes={activeInline.draft.notes}
						noteVisible={activeInline.noteVisible}
						saving={activeInline.saving}
						onBlurEditor={(refocus) => {
							void editor.actions.blurInlineEditor(refocus);
						}}
						onChangeName={editor.actions.changeName}
						onChangeNotes={editor.actions.changeNotes}
						onOpenDetails={editor.actions.openDetails}
						onShowNote={editor.actions.showNote}
						onSubmitTitle={() => {
							void editor.actions.submitTitle();
						}}
						onToggleItem={() => undefined}
					/>
				);
			}

			if (
				activeInline?.sourceKind === "existing" &&
				activeInline.itemId === item.id
			) {
				return (
					<ItemInlineForm
						checked={item.checked}
						mode="existing"
						name={activeInline.draft.name}
						notes={activeInline.draft.notes}
						noteVisible={activeInline.noteVisible}
						saving={activeInline.saving}
						onBlurEditor={(refocus) => {
							void editor.actions.blurInlineEditor(refocus);
						}}
						onChangeName={editor.actions.changeName}
						onChangeNotes={editor.actions.changeNotes}
						onOpenDetails={editor.actions.openDetails}
						onShowNote={editor.actions.showNote}
						onSubmitTitle={() => {
							void editor.actions.submitTitle();
						}}
						onToggleItem={() => {
							void editor.actions.toggleItem(item.id);
						}}
					/>
				);
			}

			return (
				<ItemRow
					checked={item.checked}
					checkedByMemberName={item.checkedByMemberName}
					id={item.id}
					name={item.name}
					notes={item.notes}
					quantity={item.quantity}
					onEditItem={(itemId) => {
						void editor.actions.startEditing(itemId);
					}}
					onToggleItem={(itemId) => {
						void editor.actions.toggleItem(itemId);
					}}
				/>
			);
		},
		[activeInline, editor.actions],
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
		void editor.actions.blurInlineEditor(() => undefined);
	}

	return (
		<>
			<Animated.FlatList
				automaticallyAdjustKeyboardInsets
				data={rows}
				extraData={editor.state}
				keyExtractor={keyExtractor}
				renderItem={renderItem}
				ItemSeparatorComponent={ItemSeparator}
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
					styles.contentInsets(topContentInset ?? 0, bottomContentInset),
				]}
			/>
			<ItemDetailsSheet editor={editor} />
		</>
	);
}

type InlinePresentation = {
	sourceKind: "new" | "existing";
	itemId: string | null;
	draftKey: number;
	draft: ItemDraftValues;
	noteVisible: boolean;
	saving: boolean;
};

function inlinePresentation(editor: ItemEditor): InlinePresentation | null {
	const { state } = editor;
	if (state.status === "idle") return null;

	if (state.status === "inline") {
		return {
			sourceKind: state.source.kind,
			itemId: state.source.kind === "existing" ? state.source.itemId : null,
			draftKey: state.source.kind === "new" ? state.source.draftKey : 0,
			draft: state.draft,
			noteVisible: state.noteVisible,
			saving: false,
		};
	}

	if (state.status === "details") {
		return {
			sourceKind: state.source.kind,
			itemId: state.source.kind === "existing" ? state.source.itemId : null,
			draftKey: state.source.kind === "new" ? state.source.draftKey : 0,
			draft: state.inlineDraft,
			noteVisible: state.inlineDraft.notes.length > 0,
			saving: false,
		};
	}

	const recoveryDraft =
		state.recovery.kind === "details"
			? state.recovery.inlineDraft
			: state.draft;
	return {
		sourceKind: state.source.kind,
		itemId: state.source.kind === "existing" ? state.source.itemId : null,
		draftKey: state.source.kind === "new" ? state.source.draftKey : 0,
		draft: recoveryDraft,
		noteVisible:
			state.recovery.kind === "inline"
				? state.recovery.noteVisible
				: recoveryDraft.notes.length > 0,
		saving: true,
	};
}

function itemListRows(
	items: readonly ActiveListItem[],
	activeInline: InlinePresentation | null,
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
	activeInline: InlinePresentation,
): boolean {
	if (activeInline.sourceKind === "new") return isNewItemDraftRow(row);
	return !isNewItemDraftRow(row) && row.id === activeInline.itemId;
}

function inlinePresentationKey(activeInline: InlinePresentation): string {
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

function ItemSeparator() {
	return <View style={styles.itemSeparator} />;
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
		height: theme.borders.hairline,
		marginLeft: theme.spacing(14),
		marginRight: theme.spacing(5),
		backgroundColor: theme.colors.border,
	},
}));
