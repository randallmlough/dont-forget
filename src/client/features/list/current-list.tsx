import { SymbolView } from "expo-symbols";
import { useCallback, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Animated,
	FlatList,
	type GestureResponderHandlers,
	PanResponder,
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
};

export function CurrentList({
	session,
	deps,
	focusedListId,
	onFocusList,
	onOpenLists,
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
			currentList={loadState}
			focusedListId={resolvedFocusedListId}
			listSummaries={listRows.summaries}
			session={session}
			syncState={syncState}
			onFocusList={onFocusList}
		/>
	);
}

type ActiveCurrentListState = Extract<
	HomeCurrentListData["state"],
	{ status: "active" }
>;

type HomeListPagerProps = {
	currentList: ActiveCurrentListState;
	focusedListId: string;
	listSummaries: ListSummary[];
	session: AuthenticatedAppSession;
	syncState: ActiveListSyncState;
	onFocusList: (listId: string) => Promise<boolean>;
};

type HomePagerRoot = {
	gestureHandlers: GestureResponderHandlers;
};

function HomeListPager({
	currentList,
	focusedListId,
	listSummaries,
	session,
	syncState,
	onFocusList,
}: HomeListPagerProps) {
	const { width } = useWindowDimensions();
	const [dragX] = useState(() => new Animated.Value(0));
	const summaries = listSummaries;
	const [pickerOpen, setPickerOpen] = useState(false);
	const [composerListId, setComposerListId] = useState<string | null>(null);
	const [selectionPending, setSelectionPending] = useState(false);
	const focusedIndex = Math.max(
		0,
		summaries.findIndex((summary) => summary.id === focusedListId),
	);
	const previousSummary = summaries[focusedIndex - 1];
	const focusedSummary = summaries[focusedIndex];
	const nextSummary = summaries[focusedIndex + 1];

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

	async function selectFromPicker(summary: ListSummary): Promise<void> {
		const didFocus = await focusList(summary.id);
		if (!didFocus) return;
		setPickerOpen(false);
	}

	const resetDrag = useCallback(() => {
		Animated.spring(dragX, {
			toValue: 0,
			useNativeDriver: true,
		}).start();
	}, [dragX]);

	const settleSwipe = useCallback(
		(summary: ListSummary, destination: number) => {
			Animated.timing(dragX, {
				toValue: destination,
				duration: 180,
				useNativeDriver: true,
			}).start(({ finished }) => {
				dragX.stopAnimation();
				dragX.setValue(0);
				if (!finished) return;
				void focusList(summary.id).then((didFocus) => {
					if (!didFocus) resetDrag();
				});
			});
		},
		[dragX, focusList, resetDrag],
	);

	const gesturesEnabled =
		summaries.length > 1 &&
		!pickerOpen &&
		composerListId === null &&
		!selectionPending;
	const panResponder = useMemo(
		() =>
			PanResponder.create({
				onMoveShouldSetPanResponderCapture: (_event, gesture) =>
					gesturesEnabled &&
					Math.abs(gesture.dx) > 12 &&
					Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
				onPanResponderMove: (_event, gesture) => {
					if (gesture.dx < 0 && !nextSummary) {
						dragX.setValue(gesture.dx * 0.15);
						return;
					}
					if (gesture.dx > 0 && !previousSummary) {
						dragX.setValue(gesture.dx * 0.15);
						return;
					}
					dragX.setValue(gesture.dx);
				},
				onPanResponderRelease: (_event, gesture) => {
					const crossedDistance = Math.abs(gesture.dx) > width * 0.2;
					const crossedVelocity = Math.abs(gesture.vx) > 0.5;
					if (
						(crossedDistance || crossedVelocity) &&
						gesture.dx < 0 &&
						nextSummary
					) {
						settleSwipe(nextSummary, -width);
						return;
					}
					if (
						(crossedDistance || crossedVelocity) &&
						gesture.dx > 0 &&
						previousSummary
					) {
						settleSwipe(previousSummary, width);
						return;
					}
					resetDrag();
				},
				onPanResponderTerminate: resetDrag,
			}),
		[
			dragX,
			gesturesEnabled,
			nextSummary,
			previousSummary,
			resetDrag,
			settleSwipe,
			width,
		],
	);

	function renderAdjacentPage(summary: ListSummary, left: number) {
		const initialState =
			summary.id === currentList.listId ? currentList : undefined;

		return (
			<Animated.View
				accessibilityElementsHidden
				key={summary.id}
				pointerEvents="none"
				style={[
					styles.positionedPage,
					{ left, width, transform: [{ translateX: dragX }] },
				]}
				testID={`home-adjacent-list-page-${summary.id}`}
			>
				<HomeListPage
					composerOpen={composerListId === summary.id}
					focused={false}
					initialState={initialState}
					listSummaries={summaries}
					pageWidth={width}
					session={session}
					summary={summary}
					syncState={syncState}
					onDismissComposer={() => setComposerListId(null)}
					onOpenComposer={() => setComposerListId(summary.id)}
				/>
			</Animated.View>
		);
	}

	const focusedInitialState =
		focusedSummary?.id === currentList.listId ? currentList : undefined;
	const pagerRoot: HomePagerRoot = {
		gestureHandlers: panResponder.panHandlers,
	};

	return (
		<>
			{focusedSummary ? (
				<HomeListPage
					composerOpen={composerListId === focusedSummary.id}
					focused
					initialState={focusedInitialState}
					listSummaries={summaries}
					pageWidth={width}
					pagerRoot={pagerRoot}
					session={session}
					summary={focusedSummary}
					syncState={syncState}
					onDismissComposer={() => setComposerListId(null)}
					onOpenComposer={() => setComposerListId(focusedSummary.id)}
				/>
			) : null}
			{previousSummary ? renderAdjacentPage(previousSummary, -width) : null}
			{nextSummary ? renderAdjacentPage(nextSummary, width) : null}
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
	pageWidth,
	pagerRoot,
	focused,
	composerOpen,
	initialState,
	onOpenComposer,
	onDismissComposer,
}: {
	summary: ListSummary;
	session: AuthenticatedAppSession;
	syncState: ActiveListSyncState;
	listSummaries: readonly ListSummary[];
	pageWidth: number;
	pagerRoot?: HomePagerRoot;
	focused: boolean;
	composerOpen: boolean;
	initialState?: ActiveCurrentListState;
	onOpenComposer: () => void;
	onDismissComposer: () => void;
}) {
	if (initialState) {
		return (
			<HomeListPageState
				composerOpen={composerOpen}
				focused={focused}
				listSummaries={listSummaries}
				pageWidth={pageWidth}
				pagerRoot={pagerRoot}
				session={session}
				state={initialState}
				syncState={syncState}
				onDismissComposer={onDismissComposer}
				onOpenComposer={onOpenComposer}
			/>
		);
	}

	return (
		<WatchedHomeListPage
			composerOpen={composerOpen}
			focused={focused}
			listSummaries={listSummaries}
			pageWidth={pageWidth}
			pagerRoot={pagerRoot}
			session={session}
			summary={summary}
			syncState={syncState}
			onDismissComposer={onDismissComposer}
			onOpenComposer={onOpenComposer}
		/>
	);
}

function WatchedHomeListPage({
	summary,
	session,
	...props
}: Omit<Parameters<typeof HomeListPage>[0], "initialState">) {
	const state = useListPage(session, summary);

	return <HomeListPageState {...props} session={session} state={state} />;
}

function HomeListPageState({
	state,
	session,
	syncState,
	listSummaries,
	pageWidth,
	pagerRoot,
	focused,
	composerOpen,
	onOpenComposer,
	onDismissComposer,
}: {
	state: ListPageState | ActiveCurrentListState;
	session: AuthenticatedAppSession;
	syncState: ActiveListSyncState;
	listSummaries: readonly ListSummary[];
	pageWidth: number;
	pagerRoot?: HomePagerRoot;
	focused: boolean;
	composerOpen: boolean;
	onOpenComposer: () => void;
	onDismissComposer: () => void;
}) {
	if (state.status === "loading") {
		return (
			<View
				{...pagerRoot?.gestureHandlers}
				style={[styles.page, { width: pageWidth }]}
				testID={pagerRoot ? "home-list-pager" : undefined}
			>
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
			<View
				{...pagerRoot?.gestureHandlers}
				style={[styles.page, { width: pageWidth }]}
				testID={pagerRoot ? "home-list-pager" : undefined}
			>
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
			pageWidth={pageWidth}
			pagerRoot={pagerRoot}
			session={session}
			syncState={syncState}
			onDismissComposer={onDismissComposer}
			onOpenComposer={onOpenComposer}
		/>
	);
}

function ActiveHomeListPage({
	loadState,
	session,
	syncState,
	listSummaries,
	pageWidth,
	pagerRoot,
	focused,
	composerOpen,
	onOpenComposer,
	onDismissComposer,
}: {
	loadState: Extract<ListPageState, { status: "active" }>;
	session: AuthenticatedAppSession;
	syncState: ActiveListSyncState;
	listSummaries: readonly ListSummary[];
	pageWidth: number;
	pagerRoot?: HomePagerRoot;
	focused: boolean;
	composerOpen: boolean;
	onOpenComposer: () => void;
	onDismissComposer: () => void;
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

	const pageContents = (
		<>
			<ItemRows
				bottomContentInset={insets.bottom + theme.spacing(20)}
				gestureHandlers={pagerRoot?.gestureHandlers}
				items={loadState.list.items}
				listOverview={
					<ListOverview
						state={loadState.list}
						meta={{
							currentMemberName: sessionMemberDisplayName(session),
							errorMessage: actions.errorMessage,
							syncState,
						}}
					/>
				}
				onPressBlankSpace={focused ? onOpenComposer : undefined}
				onToggleItem={actions.toggleItem}
				testID={pagerRoot ? "home-list-pager" : undefined}
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

	if (pagerRoot) return pageContents;

	return (
		<View style={[styles.page, { width: pageWidth }]}>{pageContents}</View>
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
	positionedPage: {
		position: "absolute",
		top: 0,
		bottom: 0,
	},
	page: {
		flex: 1,
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
