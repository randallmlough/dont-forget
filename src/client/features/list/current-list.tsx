import { SymbolView } from "expo-symbols";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
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
import Animated, {
	Extrapolation,
	interpolate,
	type SharedValue,
	useAnimatedScrollHandler,
	useAnimatedStyle,
	useSharedValue,
} from "react-native-reanimated";
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
	/**
	 * Height of the transparent stack header each List page scrolls under. It
	 * insets the page content and sizes the page's sticky List title.
	 */
	topContentInset?: number;
};

export function CurrentList({
	session,
	deps,
	focusedListId,
	onFocusList,
	onOpenLists,
	topContentInset = 0,
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
	topContentInset: number;
};

function HomeListPager({
	focusedListId,
	listSummaries,
	session,
	syncState,
	onFocusList,
	topContentInset,
}: HomeListPagerProps) {
	const { width } = useWindowDimensions();
	const pagerRef = useRef<FlatList<ListSummary>>(null);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [composerListId, setComposerListId] = useState<string | null>(null);
	const [selectionPending, setSelectionPending] = useState(false);
	const focusedIndex = Math.max(
		0,
		listSummaries.findIndex((summary) => summary.id === focusedListId),
	);
	// Horizontal pager offset in points, written on the UI thread so the
	// carousel transform on each page never routes scroll frames through React
	// state. It starts where `initialScrollIndex` puts the pager so the first
	// frame is not tilted.
	const pagerOffsetX = useSharedValue(focusedIndex * width);
	const pagerScrollHandler = useAnimatedScrollHandler((event) => {
		pagerOffsetX.set(event.contentOffset.x);
	});

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

	async function selectFromPicker(summary: ListSummary): Promise<void> {
		if (!listSummaries.some((candidate) => candidate.id === summary.id)) return;
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
				listSummaries.length - 1,
				Math.round(event.nativeEvent.contentOffset.x / width),
			),
		);
		const summary = listSummaries[settledIndex];
		if (!summary || summary.id === focusedListId) return;
		void focusList(summary.id).then((didFocus) => {
			if (didFocus) return;
			pagerRef.current?.scrollToIndex({
				animated: true,
				index: focusedIndex,
			});
		});
	}

	return (
		<>
			<Animated.FlatList
				data={listSummaries}
				decelerationRate="fast"
				getItemLayout={pageLayout}
				horizontal
				initialNumToRender={Math.min(3, listSummaries.length)}
				initialScrollIndex={focusedIndex}
				keyExtractor={listSummaryKey}
				keyboardDismissMode="on-drag"
				maxToRenderPerBatch={3}
				pagingEnabled
				ref={pagerRef}
				removeClippedSubviews={false}
				renderItem={({ item: summary, index }) => {
					const focused = summary.id === focusedListId;
					return (
						<CarouselPage
							focused={focused}
							index={index}
							pagerOffsetX={pagerOffsetX}
							testID={
								focused
									? `home-list-page-${summary.id}`
									: `home-adjacent-list-page-${summary.id}`
							}
							width={width}
						>
							<HomeListPage
								composerOpen={composerListId === summary.id}
								focused={focused}
								listSummaries={listSummaries}
								session={session}
								summary={summary}
								syncState={syncState}
								topContentInset={topContentInset}
								onDismissComposer={() => setComposerListId(null)}
								onOpenComposer={() => setComposerListId(summary.id)}
							/>
						</CarouselPage>
					);
				}}
				scrollEnabled={
					listSummaries.length > 1 &&
					!pickerOpen &&
					composerListId === null &&
					!selectionPending
				}
				scrollEventThrottle={16}
				showsHorizontalScrollIndicator={false}
				style={styles.pager}
				testID="home-list-pager"
				windowSize={3}
				onMomentumScrollEnd={pageSettled}
				onScroll={pagerScrollHandler}
			/>
			{composerListId === null ? (
				pickerOpen ? (
					<HomeListPicker
						focusedListId={focusedListId}
						listSummaries={listSummaries}
						selectedIndex={focusedIndex}
						selectionPending={selectionPending}
						onClose={() => setPickerOpen(false)}
						onSelect={(summary) => void selectFromPicker(summary)}
					/>
				) : (
					<HomePickerControl
						listCount={listSummaries.length}
						pickerOpen={false}
						selectedIndex={focusedIndex}
						onPress={() => setPickerOpen(true)}
					/>
				)
			) : null}
		</>
	);
}

/**
 * Physical geometry of the pager carousel, not design tokens.
 *
 * Pages sit on the outside of a very wide cylinder: a long focal length keeps
 * the tilt gentle, and a page one swipe away is turned by
 * `PAGE_TILT_DEGREES`, its far edge pushed back and dimmed to
 * `PAGE_TILT_OPACITY`.
 */
const PAGE_FOCAL_LENGTH_RATIO = 2.5;
const PAGE_TILT_DEGREES = 18;
const PAGE_TILT_OPACITY = 0.85;

/**
 * One List page, rotated around the edge it shares with the page beside it so
 * the pages read as panels of a cylinder rather than flat sliding cards. The
 * whole page turns, large title and sticky title included.
 *
 * React Native's `transformOrigin` cannot express this: the anchor has to flip
 * to the opposite edge once a page crosses the viewport, so the anchor is
 * animated the classic way instead, by translating the rotation axis into
 * place and back inside the transform list. That keeps every frame on the UI
 * thread, and paging geometry untouched, since only the transform moves.
 */
function CarouselPage({
	children,
	focused,
	index,
	pagerOffsetX,
	testID,
	width,
}: {
	children: ReactNode;
	focused: boolean;
	index: number;
	pagerOffsetX: SharedValue<number>;
	testID: string;
	width: number;
}) {
	const pageStyle = useAnimatedStyle(() => {
		// 0 while this page fills the viewport; -1 and 1 park it one page to the
		// right and one page to the left.
		const progress = (pagerOffsetX.get() - index * width) / width;
		// A positive `rotateY` pushes a page's right edge away from the viewer,
		// so the page waiting on the right turns positive and the page leaving
		// to the left turns negative.
		const tilt = interpolate(
			progress,
			[-1, 0, 1],
			[PAGE_TILT_DEGREES, 0, -PAGE_TILT_DEGREES],
			Extrapolation.CLAMP,
		);
		// The shared edge: the page on the right hinges on its left edge, the
		// page on the left hinges on its right edge, so the seam stays closed.
		const hingeX = progress < 0 ? -width / 2 : width / 2;
		return {
			opacity: interpolate(
				progress,
				[-1, 0, 1],
				[PAGE_TILT_OPACITY, 1, PAGE_TILT_OPACITY],
				Extrapolation.CLAMP,
			),
			transform: [
				{ perspective: width * PAGE_FOCAL_LENGTH_RATIO },
				{ translateX: hingeX },
				{ rotateY: `${tilt}deg` },
				{ translateX: -hingeX },
			],
		};
	});

	return (
		<Animated.View
			accessibilityElementsHidden={!focused}
			importantForAccessibility={focused ? "auto" : "no-hide-descendants"}
			pointerEvents={focused ? "auto" : "none"}
			style={[styles.page, { width }, pageStyle]}
			testID={testID}
		>
			{children}
		</Animated.View>
	);
}

type HomeListPageProps = {
	summary: ListSummary;
	session: AuthenticatedAppSession;
	syncState: ActiveListSyncState;
	listSummaries: readonly ListSummary[];
	focused: boolean;
	composerOpen: boolean;
	topContentInset: number;
	onOpenComposer: () => void;
	onDismissComposer: () => void;
};

function HomeListPage({
	summary,
	session,
	syncState,
	listSummaries,
	focused,
	composerOpen,
	topContentInset,
	onOpenComposer,
	onDismissComposer,
}: HomeListPageProps) {
	const state = useListPage(session, summary);

	if (state.status === "loading") {
		return (
			<View style={[styles.page, { paddingTop: topContentInset }]}>
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
			<View style={[styles.page, { paddingTop: topContentInset }]}>
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
	topContentInset,
}: HomeListPageProps & {
	loadState: Extract<ListPageState, { status: "active" }>;
}) {
	const insets = useSafeAreaInsets();
	const { theme } = useUnistyles();
	const scrollOffsetY = useSharedValue(0);
	const largeTitleHeight = useSharedValue(0);
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
					<View>
						<HomeListPageTitle
							title={summary.name}
							onMeasureHeight={(height) => largeTitleHeight.set(height)}
						/>
						<ListOverview
							state={loadState.list}
							meta={{
								currentMemberName: sessionMemberDisplayName(session),
								errorMessage: actions.errorMessage,
								syncState,
							}}
						/>
					</View>
				}
				onPressBlankSpace={focused ? onOpenComposer : undefined}
				scrollOffsetY={scrollOffsetY}
				topContentInset={topContentInset}
				onToggleItem={actions.toggleItem}
				testID={`home-list-items-${summary.id}`}
			/>
			<StickyListTitle
				collapseOffset={largeTitleHeight}
				height={topContentInset}
				listId={summary.id}
				scrollOffsetY={scrollOffsetY}
				title={summary.name}
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

function HomeListPageTitle({
	title,
	onMeasureHeight,
}: {
	title: string;
	onMeasureHeight?: (height: number) => void;
}) {
	return (
		<Text
			accessibilityRole="header"
			style={styles.pageTitle}
			onLayout={(event) => onMeasureHeight?.(event.nativeEvent.layout.height)}
		>
			{title}
		</Text>
	);
}

/**
 * Compact List title that fills the transparent header band once this page's
 * own large title has scrolled under it. It lives inside the page, so it slides
 * away with the page during a horizontal swipe and each page keeps its own
 * collapsed state. It repeats the large title, which stays the page's heading
 * for assistive technology, so it is hidden from assistive technology.
 */
function StickyListTitle({
	collapseOffset,
	height,
	listId,
	scrollOffsetY,
	title,
}: {
	collapseOffset: SharedValue<number>;
	height: number;
	listId: string;
	scrollOffsetY: SharedValue<number>;
	title: string;
}) {
	const { theme } = useUnistyles();
	const fadeDistance = theme.spacing(6);
	const titleBarStyle = useAnimatedStyle(() => {
		const collapsedAt = collapseOffset.get();
		if (collapsedAt <= 0) return { opacity: 0 };
		return {
			opacity: interpolate(
				scrollOffsetY.get(),
				[collapsedAt - fadeDistance, collapsedAt],
				[0, 1],
				Extrapolation.CLAMP,
			),
		};
	});

	return (
		<Animated.View
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
			pointerEvents="none"
			style={[styles.stickyTitleBar, { height }, titleBarStyle]}
			testID={`home-list-sticky-title-${listId}`}
		>
			<Text numberOfLines={1} style={styles.stickyTitle}>
				{title}
			</Text>
		</Animated.View>
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
	stickyTitleBar: {
		position: "absolute",
		top: 0,
		right: 0,
		left: 0,
		zIndex: 20,
		alignItems: "center",
		justifyContent: "flex-end",
		// Clears the leading and trailing stack toolbar buttons.
		paddingHorizontal: theme.spacing(14),
		paddingBottom: theme.spacing(2),
		backgroundColor: theme.colors.background,
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	stickyTitle: {
		...theme.typography.headline,
		color: theme.colors.foreground,
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
