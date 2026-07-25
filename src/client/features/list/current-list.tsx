import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	Pressable,
	Text,
	useWindowDimensions,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { AddItemListOption } from "@/client/features/list/add-item-composer";
import type { ListSummary } from "@/client/features/list/list-service";
import {
	type AuthenticatedAppSession,
	sessionMemberDisplayName,
} from "@/client/session";
import { Button } from "@/client/ui/button";
import { GlassSurface } from "@/client/ui/glass-surface";
import { AddItemForm } from "./add-item-form";
import { HomeRetryButton, HomeStatus } from "./home-status";
import { ItemRows } from "./item-rows";
import { ListOverview } from "./list-overview";
import type { ActiveListSyncState } from "./list-view-types";
import type { HomeCurrentListData } from "./use-home-current-list";
import { useListActions } from "./use-list-actions";
import { type ListPageState, useListPage } from "./use-list-page";
import type { ListRows } from "./use-list-rows";

// Separate thresholds prevent the native toolbar title from flickering while
// iOS bounces the List near its expanded position.
const TOOLBAR_TITLE_COLLAPSE_OFFSET = 24;
const TOOLBAR_TITLE_EXPAND_OFFSET = 8;

export type HomeCurrentListDeps = {
	currentList: HomeCurrentListData;
	syncState: ActiveListSyncState;
	listRows: ListRows;
};

export type CurrentListProps = {
	session: AuthenticatedAppSession;
	deps: HomeCurrentListDeps;
	focusedListId: string | null;
	onFocusList: (listId: string) => Promise<boolean>;
	onOpenLists: () => void;
	onToolbarTitleChange?: (collapsedListId: string | null) => void;
	topContentInset?: number;
};

export function CurrentList({
	session,
	deps,
	focusedListId,
	onFocusList,
	onOpenLists,
	onToolbarTitleChange,
	topContentInset,
}: CurrentListProps) {
	const { currentList, syncState, listRows } = deps;
	const loadState = currentList.state;

	if (listRows.status === "loading" || loadState.status === "loading") {
		return (
			<HomeStatus
				title="Preparing your Household"
				body="Loading your Household List."
			>
				<ActivityIndicator />
			</HomeStatus>
		);
	}

	if (listRows.status === "error" || loadState.status === "error") {
		return (
			<HomeStatus
				title="List unavailable"
				body={
					loadState.status === "error"
						? loadState.message
						: "Unable to load your Lists. Please try again."
				}
			>
				<HomeRetryButton onPress={currentList.retry} />
			</HomeStatus>
		);
	}

	if (loadState.status === "zeroActive" || listRows.summaries.length === 0) {
		return (
			<HomeStatus
				title="No active Lists"
				body="Create a List to start adding Items."
			>
				<Button onPress={onOpenLists}>Create List</Button>
			</HomeStatus>
		);
	}

	const resolvedFocusedListId =
		focusedListId &&
		listRows.summaries.some((summary) => summary.id === focusedListId)
			? focusedListId
			: loadState.listId;

	return (
		<HomeListPager
			key={session.activeHousehold.id}
			focusedListId={resolvedFocusedListId}
			listSummaries={listRows.summaries}
			session={session}
			syncState={syncState}
			onFocusList={onFocusList}
			onToolbarTitleChange={onToolbarTitleChange}
			topContentInset={topContentInset}
		/>
	);
}

type HomeListPagerProps = {
	focusedListId: string;
	listSummaries: ListSummary[];
	session: AuthenticatedAppSession;
	syncState: ActiveListSyncState;
	onFocusList: (listId: string) => Promise<boolean>;
	onToolbarTitleChange?: (collapsedListId: string | null) => void;
	topContentInset?: number;
};

function HomeListPager({
	focusedListId,
	listSummaries,
	session,
	syncState,
	onFocusList,
	onToolbarTitleChange,
	topContentInset,
}: HomeListPagerProps) {
	const { width } = useWindowDimensions();
	const pagerRef = useRef<FlatList<ListSummary>>(null);
	const toolbarStateRef = useRef({
		listId: focusedListId,
		collapsed: false,
	});
	const summaries = listSummaries;
	const [pickerOpen, setPickerOpen] = useState(false);
	const [composerListId, setComposerListId] = useState<string | null>(null);
	const [selectionPending, setSelectionPending] = useState(false);
	const focusedIndex = Math.max(
		0,
		summaries.findIndex((summary) => summary.id === focusedListId),
	);

	const focusList = useCallback(
		async (listId: string): Promise<boolean> => {
			if (selectionPending) return false;
			setSelectionPending(true);
			try {
				return await onFocusList(listId);
			} finally {
				setSelectionPending(false);
			}
		},
		[onFocusList, selectionPending],
	);

	useEffect(() => {
		pagerRef.current?.scrollToIndex({ animated: false, index: focusedIndex });
	}, [focusedIndex]);

	useEffect(() => {
		toolbarStateRef.current = { listId: focusedListId, collapsed: false };
		onToolbarTitleChange?.(null);
	}, [focusedListId, onToolbarTitleChange]);

	useEffect(
		() => () => {
			onToolbarTitleChange?.(null);
		},
		[onToolbarTitleChange],
	);

	async function selectFromPicker(summary: ListSummary): Promise<void> {
		if (!summaries.some((candidate) => candidate.id === summary.id)) return;
		const didFocus = await focusList(summary.id);
		if (!didFocus) {
			pagerRef.current?.scrollToIndex({
				animated: true,
				index: focusedIndex,
			});
			return;
		}
		setPickerOpen(false);
	}

	function pageLayout(
		_data: ArrayLike<ListSummary> | null | undefined,
		index: number,
	) {
		return { index, length: width, offset: width * index };
	}

	function pageSettled(event: NativeSyntheticEvent<NativeScrollEvent>) {
		const settledIndex = Math.max(
			0,
			Math.min(
				summaries.length - 1,
				Math.round(event.nativeEvent.contentOffset.x / width),
			),
		);
		const summary = summaries[settledIndex];
		if (!summary || summary.id === focusedListId) return;
		void focusList(summary.id).then((didFocus) => {
			if (didFocus) return;
			pagerRef.current?.scrollToIndex({
				animated: true,
				index: focusedIndex,
			});
		});
	}

	function pageScrolled(
		summary: ListSummary,
		event: NativeSyntheticEvent<NativeScrollEvent>,
	) {
		if (summary.id !== focusedListId) return;

		const wasCollapsed =
			toolbarStateRef.current.listId === summary.id &&
			toolbarStateRef.current.collapsed;
		const offsetY =
			event.nativeEvent.contentOffset.y +
			(event.nativeEvent.contentInset?.top ?? 0);
		const collapsed = wasCollapsed
			? offsetY > TOOLBAR_TITLE_EXPAND_OFFSET
			: offsetY >= TOOLBAR_TITLE_COLLAPSE_OFFSET;
		if (collapsed === wasCollapsed) return;

		toolbarStateRef.current = { listId: summary.id, collapsed };
		onToolbarTitleChange?.(collapsed ? summary.id : null);
	}

	return (
		<>
			<FlatList
				data={summaries}
				decelerationRate="fast"
				getItemLayout={pageLayout}
				horizontal
				initialNumToRender={Math.min(3, summaries.length)}
				initialScrollIndex={focusedIndex}
				keyExtractor={listSummaryKey}
				keyboardDismissMode="on-drag"
				maxToRenderPerBatch={3}
				pagingEnabled
				ref={pagerRef}
				removeClippedSubviews={false}
				renderItem={({ item: summary }) => {
					const focused = summary.id === focusedListId;
					return (
						<View
							accessibilityElementsHidden={!focused}
							importantForAccessibility={
								focused ? "auto" : "no-hide-descendants"
							}
							pointerEvents={focused ? "auto" : "none"}
							style={[styles.page, { width }]}
							testID={
								focused
									? `home-list-page-${summary.id}`
									: `home-adjacent-list-page-${summary.id}`
							}
						>
							<HomeListPage
								composerOpen={composerListId === summary.id}
								focused={focused}
								listSummaries={summaries}
								session={session}
								summary={summary}
								syncState={syncState}
								topContentInset={topContentInset}
								onDismissComposer={() => setComposerListId(null)}
								onOpenComposer={() => setComposerListId(summary.id)}
								onScroll={(event) => pageScrolled(summary, event)}
							/>
						</View>
					);
				}}
				scrollEnabled={
					summaries.length > 1 &&
					!pickerOpen &&
					composerListId === null &&
					!selectionPending
				}
				showsHorizontalScrollIndicator={false}
				style={styles.pager}
				testID="home-list-pager"
				windowSize={3}
				onMomentumScrollEnd={pageSettled}
			/>
			{composerListId === null ? (
				pickerOpen ? (
					<HomeListPicker
						focusedListId={focusedListId}
						listSummaries={summaries}
						selectedIndex={focusedIndex}
						selectionPending={selectionPending}
						onClose={() => setPickerOpen(false)}
						onSelect={(summary) => void selectFromPicker(summary)}
					/>
				) : (
					<HomePickerControl
						listCount={summaries.length}
						pickerOpen={false}
						selectedIndex={focusedIndex}
						onPress={() => setPickerOpen(true)}
					/>
				)
			) : null}
		</>
	);
}

function HomeListPage({
	summary,
	session,
	syncState,
	listSummaries,
	focused,
	composerOpen,
	onOpenComposer,
	onDismissComposer,
	onScroll,
	topContentInset,
}: {
	summary: ListSummary;
	session: AuthenticatedAppSession;
	syncState: ActiveListSyncState;
	listSummaries: readonly ListSummary[];
	focused: boolean;
	composerOpen: boolean;
	onOpenComposer: () => void;
	onDismissComposer: () => void;
	onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
	topContentInset?: number;
}) {
	const state = useListPage(session, summary);

	return (
		<HomeListPageState
			composerOpen={composerOpen}
			focused={focused}
			listSummaries={listSummaries}
			session={session}
			state={state}
			summary={summary}
			syncState={syncState}
			topContentInset={topContentInset}
			onDismissComposer={onDismissComposer}
			onOpenComposer={onOpenComposer}
			onScroll={onScroll}
		/>
	);
}

function HomeListPageState({
	state,
	summary,
	session,
	syncState,
	listSummaries,
	focused,
	composerOpen,
	onOpenComposer,
	onDismissComposer,
	onScroll,
	topContentInset,
}: {
	state: ListPageState;
	summary: ListSummary;
	session: AuthenticatedAppSession;
	syncState: ActiveListSyncState;
	listSummaries: readonly ListSummary[];
	focused: boolean;
	composerOpen: boolean;
	onOpenComposer: () => void;
	onDismissComposer: () => void;
	onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
	topContentInset?: number;
}) {
	if (state.status === "loading") {
		return (
			<View style={styles.page}>
				<HomeListPageTitle title={summary.name} />
				<HomeStatus
					title="Preparing your Household"
					body="Loading your Household List."
				>
					<ActivityIndicator />
				</HomeStatus>
			</View>
		);
	}

	if (state.status === "error") {
		return (
			<View style={styles.page}>
				<HomeListPageTitle title={summary.name} />
				<HomeStatus title="List unavailable" body={state.message} />
			</View>
		);
	}

	return (
		<ActiveHomeListPage
			composerOpen={composerOpen}
			focused={focused}
			listSummaries={listSummaries}
			loadState={state}
			session={session}
			summary={summary}
			syncState={syncState}
			topContentInset={topContentInset}
			onDismissComposer={onDismissComposer}
			onOpenComposer={onOpenComposer}
			onScroll={onScroll}
		/>
	);
}

function ActiveHomeListPage({
	loadState,
	session,
	syncState,
	listSummaries,
	summary,
	focused,
	composerOpen,
	onOpenComposer,
	onDismissComposer,
	onScroll,
	topContentInset,
}: {
	loadState: Extract<ListPageState, { status: "active" }>;
	session: AuthenticatedAppSession;
	syncState: ActiveListSyncState;
	listSummaries: readonly ListSummary[];
	summary: ListSummary;
	focused: boolean;
	composerOpen: boolean;
	onOpenComposer: () => void;
	onDismissComposer: () => void;
	onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
	topContentInset?: number;
}) {
	const insets = useSafeAreaInsets();
	const { theme } = useUnistyles();
	const actions = useListActions({
		items: loadState.list.items,
		onAddItem: loadState.actions.addItem,
		onSetItemChecked: loadState.actions.setItemChecked,
	});
	const composerListOptions = addItemListOptions({
		currentListId: loadState.listId,
		currentListName: loadState.list.listName,
		summaries: listSummaries,
	});

	return (
		<>
			<ItemRows
				bottomContentInset={insets.bottom + theme.spacing(20)}
				focused={focused}
				items={loadState.list.items}
				listOverview={
					<HomeListPageHeader
						list={loadState.list}
						summary={summary}
						meta={{
							currentMemberName: sessionMemberDisplayName(session),
							errorMessage: actions.errorMessage,
							syncState,
						}}
					/>
				}
				onPressBlankSpace={focused ? onOpenComposer : undefined}
				onScroll={onScroll}
				topContentInset={topContentInset}
				onToggleItem={actions.toggleItem}
				testID={`home-list-items-${summary.id}`}
			/>
			<AddItemForm
				currentListId={loadState.listId}
				errorMessage={actions.errorMessage}
				listOptions={composerListOptions}
				onAddItem={actions.addItem}
				presentation={{
					kind: "controlledOverlay",
					isOpen: composerOpen,
					onDismiss: onDismissComposer,
				}}
			/>
		</>
	);
}

function HomeListPageHeader({
	summary,
	list,
	meta,
}: {
	summary: ListSummary;
	list: Parameters<typeof ListOverview>[0]["state"];
	meta: Parameters<typeof ListOverview>[0]["meta"];
}) {
	return (
		<View>
			<HomeListPageTitle title={summary.name} />
			<ListOverview state={list} meta={meta} />
		</View>
	);
}

function HomeListPageTitle({ title }: { title: string }) {
	return (
		<Text accessibilityRole="header" style={styles.pageTitle}>
			{title}
		</Text>
	);
}

function HomeListPicker({
	listSummaries,
	focusedListId,
	selectedIndex,
	selectionPending,
	onClose,
	onSelect,
}: {
	listSummaries: readonly ListSummary[];
	focusedListId: string;
	selectedIndex: number;
	selectionPending: boolean;
	onClose: () => void;
	onSelect: (summary: ListSummary) => void;
}) {
	const insets = useSafeAreaInsets();
	const { theme } = useUnistyles();

	return (
		<View
			accessibilityLabel="List picker"
			accessibilityViewIsModal
			style={styles.pickerOverlay}
			testID="home-list-picker"
		>
			<FlatList
				contentContainerStyle={[
					styles.pickerContent,
					{ paddingBottom: insets.bottom },
				]}
				contentInsetAdjustmentBehavior="automatic"
				data={listSummaries}
				keyExtractor={listSummaryKey}
				ListHeaderComponent={
					<Text accessibilityRole="header" style={styles.pickerTitle}>
						Choose a List
					</Text>
				}
				renderItem={({ item: summary }) => {
					const selected = summary.id === focusedListId;
					return (
						<Pressable
							accessibilityHint="Shows this List on Home"
							accessibilityLabel={summary.name}
							accessibilityRole="button"
							accessibilityState={{ selected, disabled: selectionPending }}
							disabled={selectionPending}
							onPress={() => onSelect(summary)}
							style={({ pressed }) => [
								styles.pickerRow,
								selected ? styles.pickerRowSelected : undefined,
								pressed ? styles.pickerRowPressed : undefined,
							]}
						>
							<View style={styles.pickerRowText}>
								<Text numberOfLines={1} style={styles.pickerRowTitle}>
									{summary.name}
								</Text>
								<Text style={styles.pickerRowDetail}>
									{listCounts(summary)}
								</Text>
							</View>
							{selected ? (
								<SymbolView
									accessibilityElementsHidden
									accessible={false}
									name="checkmark"
									size={17}
									tintColor={theme.colors.primary}
									weight="semibold"
								/>
							) : null}
						</Pressable>
					);
				}}
			/>
			<HomePickerControl
				listCount={listSummaries.length}
				pickerOpen
				selectedIndex={selectedIndex}
				onPress={onClose}
			/>
		</View>
	);
}

function HomePickerControl({
	listCount,
	selectedIndex,
	pickerOpen,
	onPress,
}: {
	listCount: number;
	selectedIndex: number;
	pickerOpen: boolean;
	onPress: () => void;
}) {
	const insets = useSafeAreaInsets();
	const { theme } = useUnistyles();

	return (
		<View
			pointerEvents="box-none"
			style={[
				styles.pickerControlPosition,
				{ bottom: insets.bottom + theme.spacing(2) },
			]}
		>
			<GlassSurface interactive style={styles.pickerControlSurface}>
				<Button
					accessibilityHint={
						pickerOpen
							? "Returns to the focused List"
							: "Opens the Home List picker"
					}
					accessibilityLabel={pickerOpen ? "Close List picker" : "Choose List"}
					onPress={onPress}
					size="sm"
					style={styles.pickerControl}
					variant="link"
				>
					<SymbolView
						accessibilityElementsHidden
						accessible={false}
						name={pickerOpen ? "xmark" : "square.grid.2x2"}
						size={17}
						tintColor={theme.colors.foreground}
						weight="semibold"
					/>
					<Text style={styles.pickerControlLabel}>
						{pickerOpen ? "Done" : `${selectedIndex + 1} of ${listCount}`}
					</Text>
				</Button>
			</GlassSurface>
		</View>
	);
}

function addItemListOptions({
	currentListId,
	currentListName,
	summaries,
}: {
	currentListId: string;
	currentListName: string;
	summaries: readonly ListSummary[];
}): AddItemListOption[] {
	return [
		{ id: currentListId, name: currentListName },
		...summaries
			.filter((summary) => summary.id !== currentListId)
			.map((summary) => ({ id: summary.id, name: summary.name })),
	];
}

function listSummaryKey(summary: ListSummary): string {
	return summary.id;
}

function listCounts(summary: ListSummary): string {
	return `${summary.uncheckedItemCount} unchecked · ${summary.checkedItemCount} checked`;
}

const styles = StyleSheet.create((theme) => ({
	pager: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	page: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	pageTitle: {
		fontSize: theme.fontSizes["5xl"],
		fontWeight: theme.fontWeights.bold,
		lineHeight: theme.lineHeights["5xl"],
		color: theme.colors.foreground,
		paddingHorizontal: theme.spacing(5),
		paddingTop: theme.spacing(2),
		paddingBottom: theme.spacing(2),
		backgroundColor: theme.colors.background,
	},
	pickerOverlay: {
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		zIndex: 30,
		backgroundColor: theme.colors.background,
	},
	pickerContent: {
		paddingHorizontal: theme.spacing(4),
		paddingTop: theme.spacing(4),
		paddingBottom: theme.spacing(20),
	},
	pickerTitle: {
		...theme.typography.title,
		color: theme.colors.foreground,
		paddingHorizontal: theme.spacing(2),
		paddingBottom: theme.spacing(4),
	},
	pickerRow: {
		minHeight: theme.spacing(16),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(4),
		paddingVertical: theme.spacing(3),
		borderRadius: theme.radii.xl,
	},
	pickerRowSelected: {
		backgroundColor: theme.colors.secondary,
	},
	pickerRowPressed: {
		opacity: theme.opacities.pressed,
	},
	pickerRowText: {
		flex: 1,
		minWidth: 0,
		gap: theme.spacing(1),
	},
	pickerRowTitle: {
		...theme.typography.body,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.foreground,
	},
	pickerRowDetail: {
		...theme.typography.caption,
		color: theme.colors.mutedForeground,
	},
	pickerControlPosition: {
		position: "absolute",
		right: 0,
		left: 0,
		zIndex: 40,
		alignItems: "center",
	},
	pickerControlSurface: {
		borderRadius: theme.radii.full,
	},
	pickerControl: {
		minHeight: theme.spacing(11),
		gap: theme.spacing(2),
		paddingHorizontal: theme.spacing(4),
	},
	pickerControlLabel: {
		...theme.typography.captionStrong,
		color: theme.colors.foreground,
	},
}));
