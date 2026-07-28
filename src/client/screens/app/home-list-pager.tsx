import { SymbolView } from "expo-symbols";
import { type ReactNode, useEffect, useRef } from "react";
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
	ReduceMotion,
	type SharedValue,
	useAnimatedScrollHandler,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import {
	ListPage,
	type ListPageEditorEvent,
	type ListPageEditorOwnerToken,
	type ListPageScrollState,
} from "@/client/features/list/list-page";
import type { ListSummary } from "@/client/features/list/list-service";
import type { ActiveListSyncState } from "@/client/features/list/list-view-types";
import type { ListCollectionState } from "@/client/features/list/use-list-collection";
import type { AuthenticatedAppSession } from "@/client/session";
import { Button } from "@/client/ui/button";
import { StatusCard } from "@/client/ui/status-card";

/**
 * Scroll state the native stack header fades its collapsed List title against,
 * published on the UI thread by the pager and by whichever page is focused. The
 * header renders outside this tree, so the screen owns the values.
 */
export type CollapsedTitleScroll = ListPageScrollState & {
	/** How far the pager has drifted off the focused page: 0 parked, 1 gone. */
	pagerDrift: SharedValue<number>;
};

/**
 * Whether the List picker is showing, and whether it is only still mounted to
 * finish receding. Home owns this because the toolbar that opens and closes the
 * picker renders outside this tree; the pager owns the zoom and reports back
 * when it lands.
 */
export type HomeListPickerPhase = "closed" | "open" | "closing";

export type HomeAddItemRequest = {
	key: number;
	listId: string;
	ownerToken: ListPageEditorOwnerToken;
};

export type HomeListPagerProps = {
	session: AuthenticatedAppSession;
	collectionState: ListCollectionState;
	syncState: ActiveListSyncState;
	focusedListId: string | null;
	collapsedTitleScroll: CollapsedTitleScroll;
	addItemRequest: HomeAddItemRequest | null;
	/** Whether the List picker should be showing instead of the focused List. */
	pickerPhase: HomeListPickerPhase;
	/** Whether a List selection is still being written. */
	selectionPending: boolean;
	/** Whether the focused editor is still deciding whether paging can finish. */
	editorFinishPending: boolean;
	onItemEditorEvent: (event: ListPageEditorEvent) => void;
	onFocusList: (listId: string) => Promise<boolean>;
	onOpenLists: () => void;
	onRetry: () => void;
	onPickerPhaseChange: (phase: HomeListPickerPhase) => void;
	/**
	 * Height of the transparent stack header each List page scrolls under. It
	 * insets the page content so the List scrolls under Apple's scroll edge
	 * effect.
	 */
	topContentInset?: number;
};

export function HomeListPager({
	session,
	collectionState,
	syncState,
	focusedListId,
	collapsedTitleScroll,
	addItemRequest,
	pickerPhase,
	selectionPending,
	editorFinishPending,
	onItemEditorEvent,
	onFocusList,
	onOpenLists,
	onRetry,
	onPickerPhaseChange,
	topContentInset = 0,
}: HomeListPagerProps) {
	if (
		collectionState.status === "loading" ||
		collectionState.status === "resolvingCurrentList"
	) {
		return (
			<StatusCard
				title="Preparing your Household"
				body="Loading your Household List."
			>
				<ActivityIndicator />
			</StatusCard>
		);
	}

	if (collectionState.status === "error") {
		return (
			<StatusCard title="List unavailable" body={collectionState.message}>
				<Button onPress={onRetry}>Try again</Button>
			</StatusCard>
		);
	}

	if (collectionState.status === "zeroActive") {
		return (
			<StatusCard
				title="No active Lists"
				body="Create a List to start adding Items."
			>
				<Button onPress={onOpenLists}>Create List</Button>
			</StatusCard>
		);
	}

	return (
		<ActiveHomeListPager
			focusedListId={focusedListId ?? collectionState.currentListId}
			collapsedTitleScroll={collapsedTitleScroll}
			addItemRequest={addItemRequest}
			listSummaries={collectionState.summaries}
			pickerPhase={pickerPhase}
			selectionPending={selectionPending}
			editorFinishPending={editorFinishPending}
			session={session}
			syncState={syncState}
			onItemEditorEvent={onItemEditorEvent}
			onFocusList={onFocusList}
			onPickerPhaseChange={onPickerPhaseChange}
			topContentInset={topContentInset}
		/>
	);
}

type ActiveHomeListPagerProps = {
	focusedListId: string;
	collapsedTitleScroll: CollapsedTitleScroll;
	addItemRequest: HomeAddItemRequest | null;
	listSummaries: readonly ListSummary[];
	pickerPhase: HomeListPickerPhase;
	selectionPending: boolean;
	editorFinishPending: boolean;
	session: AuthenticatedAppSession;
	syncState: ActiveListSyncState;
	onItemEditorEvent: (event: ListPageEditorEvent) => void;
	onFocusList: (listId: string) => Promise<boolean>;
	onPickerPhaseChange: (phase: HomeListPickerPhase) => void;
	topContentInset: number;
};

function ActiveHomeListPager({
	focusedListId,
	collapsedTitleScroll,
	addItemRequest,
	listSummaries,
	pickerPhase,
	selectionPending,
	editorFinishPending,
	session,
	syncState,
	onItemEditorEvent,
	onFocusList,
	onPickerPhaseChange,
	topContentInset,
}: ActiveHomeListPagerProps) {
	const { width } = useWindowDimensions();
	const pagerRef = useRef<FlatList<ListSummary>>(null);
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
		const offsetX = event.contentOffset.x;
		pagerOffsetX.set(offsetX);
		collapsedTitleScroll.pagerDrift.set(
			Math.min(
				1,
				Math.abs(offsetX - focusedIndex * width) /
					(width * TITLE_DRIFT_FADE_FRACTION),
			),
		);
	});
	// 0 parks the focused List page full screen, 1 parks the List picker. Both
	// surfaces read this one value, so they always meet in the middle of the
	// zoom no matter where an interruption retargets the spring.
	const pickerProgress = useSharedValue(0);
	const reducedMotion = useReducedMotion();

	// Home owns the picker phase because the toolbar that opens and closes the
	// picker renders outside this tree, so the zoom follows that prop and
	// reports back once it lands, which is what releases the receding picker to
	// unmount.
	useEffect(() => {
		if (pickerPhase === "closed") return;
		if (pickerPhase === "open") {
			pickerProgress.set(
				reducedMotion
					? withTiming(1, PICKER_CROSSFADE)
					: withSpring(1, PICKER_ZOOM_SPRING),
			);
			return;
		}

		// `finished` is false when a new transition retargets this one, which
		// must not close the picker it is reopening.
		const settled = (finished?: boolean) => {
			"worklet";
			if (finished) scheduleOnRN(onPickerPhaseChange, "closed");
		};
		pickerProgress.set(
			reducedMotion
				? withTiming(0, PICKER_CROSSFADE, settled)
				: withSpring(0, PICKER_ZOOM_SPRING, settled),
		);
	}, [onPickerPhaseChange, pickerPhase, pickerProgress, reducedMotion]);

	useEffect(() => {
		pagerRef.current?.scrollToIndex({ animated: false, index: focusedIndex });
		// Parking the pager where it already sits emits no scroll event, so the
		// drift the settling swipe left behind is published directly.
		collapsedTitleScroll.pagerDrift.set(0);
	}, [collapsedTitleScroll, focusedIndex]);

	/**
	 * The pager is parked on the selected page before the picker starts
	 * receding, because focusing the List rerenders the pager onto it in the
	 * same commit that starts the recede, while the pager is still hidden
	 * behind the picker. The write happens behind the recede rather than before
	 * it, so the tap responds instantly; a failed write reverts focus the same
	 * way a failed swipe does.
	 */
	function selectFromPicker(summary: ListSummary): void {
		if (!listSummaries.some((candidate) => candidate.id === summary.id)) return;
		onPickerPhaseChange("closing");
		void onFocusList(summary.id);
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
		void onFocusList(summary.id).then((didFocus) => {
			if (didFocus) return;
			pagerRef.current?.scrollToIndex({
				animated: true,
				index: focusedIndex,
			});
		});
	}

	const pagerSurfaceStyle = useAnimatedStyle(() => {
		const progress = pickerProgress.get();
		return {
			opacity: 1 - progress,
			transform: [
				{
					scale: interpolate(
						progress,
						[0, 1],
						[1, reducedMotion ? 1 : PAGER_RECEDE_SCALE],
					),
				},
			],
		};
	});

	return (
		<>
			{pickerPhase === "closed" ? null : (
				<HomeListPicker
					focusedListId={focusedListId}
					interactive={pickerPhase === "open"}
					listSummaries={listSummaries}
					progress={pickerProgress}
					selectionPending={selectionPending}
					onSelect={selectFromPicker}
				/>
			)}
			<Animated.View
				pointerEvents={pickerPhase === "closed" ? "auto" : "none"}
				style={[styles.pagerSurface, pagerSurfaceStyle]}
				testID="home-list-surface"
			>
				<Animated.FlatList
					data={listSummaries}
					decelerationRate="fast"
					extraData={focusedListId}
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
								<ListPage
									addItemRequest={
										focused && addItemRequest?.listId === summary.id
											? {
													key: addItemRequest.key,
													ownerToken: addItemRequest.ownerToken,
												}
											: null
									}
									focused={focused}
									listSummaries={listSummaries}
									scrollState={collapsedTitleScroll}
									session={session}
									summary={summary}
									syncState={syncState}
									topContentInset={topContentInset}
									onItemEditorEvent={onItemEditorEvent}
								/>
							</CarouselPage>
						);
					}}
					scrollEnabled={
						listSummaries.length > 1 &&
						pickerPhase === "closed" &&
						!selectionPending &&
						!editorFinishPending
					}
					scrollEventThrottle={16}
					showsHorizontalScrollIndicator={false}
					style={styles.pager}
					testID="home-list-pager"
					windowSize={3}
					onMomentumScrollEnd={pageSettled}
					onScroll={pagerScrollHandler}
				/>
			</Animated.View>
		</>
	);
}

/**
 * Physical geometry of the picker zoom, not design tokens.
 *
 * The picker sits behind the pager: opening pushes the focused List page back
 * to `PAGER_RECEDE_SCALE` as it fades out, while the picker rises from
 * `PICKER_ARRIVE_SCALE` to full size. Scale carries the transition and the
 * content swap is a crossfade, so both surfaces animate transform and opacity
 * only.
 *
 * The spring is critically damped: full-screen content that overshoots past
 * its own size reads as a glitch, not as a bounce.
 */
const PAGER_RECEDE_SCALE = 0.9;
const PICKER_ARRIVE_SCALE = 0.94;
const PICKER_ZOOM_SPRING = { duration: 420, dampingRatio: 1 } as const;
/**
 * Reduced motion drops the zoom and keeps only the crossfade, which is the
 * substitution the setting asks for rather than something it should skip, so
 * the fade opts out of being cut to an instant swap.
 */
const PICKER_CROSSFADE = {
	duration: 160,
	reduceMotion: ReduceMotion.Never,
} as const;

/**
 * Fraction of a page the pager drifts before the collapsed header title has
 * faded out completely. The title names the focused List, so it leaves as soon
 * as a swipe commits rather than hanging over the page arriving beside it.
 */
const TITLE_DRIFT_FADE_FRACTION = 0.15;

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
 * whole page turns, large title included.
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

/**
 * The List picker, mounted behind the pager for the whole zoom: the focused
 * List page shrinks away to reveal it, and a selected row grows back into a
 * full-screen page. It stops taking touches as soon as it starts receding, so
 * a row cannot be tapped through the transition.
 */
function HomeListPicker({
	listSummaries,
	focusedListId,
	interactive,
	progress,
	selectionPending,
	onSelect,
}: {
	listSummaries: readonly ListSummary[];
	focusedListId: string;
	interactive: boolean;
	progress: SharedValue<number>;
	selectionPending: boolean;
	onSelect: (summary: ListSummary) => void;
}) {
	const insets = useSafeAreaInsets();
	const { theme } = useUnistyles();
	const reducedMotion = useReducedMotion();
	const surfaceStyle = useAnimatedStyle(() => {
		const zoom = progress.get();
		return {
			opacity: zoom,
			transform: [
				{
					scale: interpolate(
						zoom,
						[0, 1],
						[reducedMotion ? 1 : PICKER_ARRIVE_SCALE, 1],
					),
				},
			],
		};
	});

	return (
		<Animated.View
			accessibilityLabel="List picker"
			accessibilityViewIsModal
			pointerEvents={interactive ? "auto" : "none"}
			style={[styles.pickerOverlay, surfaceStyle]}
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
		</Animated.View>
	);
}

function listSummaryKey(summary: ListSummary): string {
	return summary.id;
}

function listCounts(summary: ListSummary): string {
	return `${summary.uncheckedItemCount} unchecked · ${summary.checkedItemCount} checked`;
}

const styles = StyleSheet.create((theme) => ({
	pagerSurface: {
		flex: 1,
		// Above the picker overlay: the focused List page shrinks down onto the
		// picker rather than the picker sliding over the page.
		zIndex: 50,
	},
	pager: {
		flex: 1,
		backgroundColor: theme.colors.background,
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
}));
