import * as Haptics from "expo-haptics";
import { Stack } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { type AccessibilityActionEvent, View } from "react-native";
import {
	Gesture,
	GestureDetector,
	GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import type { ListSummary } from "@mobile/features/list/list-service";

/**
 * Physical geometry of the page control, not design tokens.
 *
 * The dots are Weather's proportions: small marks in a compact strip, each
 * sitting in a slot wide enough that dragging across the strip reads one List
 * per slot. The strip fills a full touch-target height even though the dots
 * themselves are tiny, and it keeps a slot's worth of slop past the end dots so
 * the first and last List stay reachable at the edges of the drag.
 *
 * Nothing caps how many Lists a Household keeps, and the toolbar hands this view
 * to UIKit as a bar item sized from its own frame, so a dot per List would grow
 * the strip until it clipped itself or the Search and Choose List buttons beside
 * it. The strip instead shows at most `PAGE_CONTROL_MAX_DOTS` dots, always at
 * full size, and windows the Lists past that: ten slots plus a chevron gutter on
 * each side is 200pt, inside the roughly 208pt those two buttons and the bar's
 * own margins leave free on the narrowest supported iPhone (375pt). The gutters
 * are reserved for as long as the Lists overflow so the dots keep their place
 * when a chevron comes and goes.
 */
const PAGE_DOT_SIZE = 7;
const PAGE_DOT_SLOT_WIDTH = 16;
const PAGE_CONTROL_HEIGHT = 44;
const PAGE_CONTROL_EDGE_SLOP = 8;
const PAGE_CONTROL_MAX_DOTS = 10;
const PAGE_OVERFLOW_CHEVRON_SIZE = 9;
const PAGE_OVERFLOW_GUTTER_WIDTH = 12;

const PAGE_CONTROL_ACTIONS = [{ name: "increment" }, { name: "decrement" }];

export type HomeListToolbarProps = {
	disabled?: boolean;
	focusedIndex: number;
	lists: readonly ListSummary[];
	pickerOpen: boolean;
	onClosePicker: () => void;
	onOpenPicker: () => void;
	/** Persists the List the page control landed on, once, at the end of a drag. */
	onCommitPage: (index: number) => void;
	/** Moves the pager onto a page mid-drag without persisting the selection. */
	onScrubToPage: (index: number) => void;
};

/**
 * Home's native bottom toolbar: Search on the left, the List page control in
 * the middle, and the List picker on the right. While the picker is up the
 * whole bar becomes its close button, which is the only action that surface
 * offers.
 */
export function HomeListToolbar({
	disabled = false,
	focusedIndex,
	lists,
	pickerOpen,
	onClosePicker,
	onOpenPicker,
	onCommitPage,
	onScrubToPage,
}: HomeListToolbarProps) {
	if (pickerOpen) {
		return (
			<Stack.Toolbar>
				<Stack.Toolbar.Spacer />
				<Stack.Toolbar.Button
					accessibilityHint="Returns to the focused List"
					accessibilityLabel="Close List picker"
					icon="xmark"
					onPress={onClosePicker}
				/>
				<Stack.Toolbar.Spacer />
			</Stack.Toolbar>
		);
	}

	return (
		<Stack.Toolbar>
			{/* Searching Lists and Items does not exist yet. The bar reserves its
			    place so the page control stays centred once it does. */}
			<Stack.Toolbar.Button
				accessibilityHint="Searching Lists and Items is not available yet"
				accessibilityLabel="Search"
				disabled
				icon="magnifyingglass"
			/>
			<Stack.Toolbar.Spacer />
			<Stack.Toolbar.View>
				<HomeListPageControl
					disabled={disabled}
					focusedIndex={focusedIndex}
					lists={lists}
					onCommitPage={onCommitPage}
					onScrubToPage={onScrubToPage}
				/>
			</Stack.Toolbar.View>
			<Stack.Toolbar.Spacer />
			<Stack.Toolbar.Button
				accessibilityHint="Opens the Home List picker"
				accessibilityLabel="Choose List"
				disabled={disabled}
				icon="list.bullet"
				onPress={onOpenPicker}
			/>
		</Stack.Toolbar>
	);
}

/**
 * A dot per List, with Weather's scrub: dragging across the dots switches Lists
 * under the finger with a tick per List, and the switch is instant because only
 * the landing List is written back when the finger lifts.
 *
 * Past the dots the strip can hold, it shows a window of Lists around the
 * focused one and a chevron on whichever side still has Lists behind it. A drag
 * reaches the window it started on; lifting recentres the window on the List it
 * landed on, so dragging again carries on through the Lists.
 */
export function HomeListPageControl({
	disabled = false,
	focusedIndex,
	lists,
	onCommitPage,
	onScrubToPage,
}: {
	disabled?: boolean;
	focusedIndex: number;
	lists: readonly ListSummary[];
	onCommitPage: (index: number) => void;
	onScrubToPage: (index: number) => void;
}) {
	const { theme } = useUnistyles();
	const pageCount = lists.length;
	// The List the window is centred on. A drag moves the focused List under the
	// finger, so the window anchors to where the drag started until it ends:
	// without that the dots would remap themselves under the finger mid-drag.
	const [anchoredIndex, setAnchoredIndex] = useState<number | null>(null);
	const pageWindow = pageControlWindow(
		anchoredIndex ?? focusedIndex,
		pageCount,
	);
	// Where the drag sits, tracked on the gesture's own runtime: a scrub tick
	// can tell a new List from a repeat without waiting for React to rerender,
	// and a press with no travel still commits the List it landed on rather
	// than the one this control was last rendered with. The window the drag
	// started on rides along, so the mapping cannot move under the finger even
	// before React has caught up with the anchor.
	const scrubbedIndex = useSharedValue(focusedIndex);
	const scrubbedWindowStart = useSharedValue(pageWindow.start);

	function scrubbedToPage(index: number) {
		void Haptics.selectionAsync();
		onScrubToPage(index);
	}

	function scrubTo(index: number) {
		"worklet";
		if (index === scrubbedIndex.get()) return;
		scrubbedIndex.set(index);
		scheduleOnRN(scrubbedToPage, index);
	}

	function commitScrub(index: number) {
		setAnchoredIndex(null);
		onCommitPage(index);
	}

	function adjustPage(event: AccessibilityActionEvent) {
		if (disabled) return;
		const step = event.nativeEvent.actionName === "increment" ? 1 : -1;
		const index = Math.min(pageCount - 1, Math.max(0, focusedIndex + step));
		if (index !== focusedIndex) onCommitPage(index);
	}

	const scrub = Gesture.Pan()
		// A press with no travel is a jump to the dot under the finger, the same
		// as the first tick of a drag, so the pan takes over immediately.
		.minDistance(0)
		.onBegin((event) => {
			"worklet";
			scrubbedIndex.set(focusedIndex);
			scrubbedWindowStart.set(pageWindow.start);
			scheduleOnRN(setAnchoredIndex, focusedIndex);
			scrubTo(
				pageIndexAtX(
					event.x,
					pageWindow.start,
					pageWindow.size,
					pageWindow.leadingInset,
				),
			);
		})
		.onUpdate((event) => {
			"worklet";
			scrubTo(
				pageIndexAtX(
					event.x,
					scrubbedWindowStart.get(),
					pageWindow.size,
					pageWindow.leadingInset,
				),
			);
		})
		.onFinalize(() => {
			"worklet";
			scheduleOnRN(commitScrub, scrubbedIndex.get());
		});

	// The toolbar hosts this view outside the app's view tree, so the gesture
	// needs its own gesture-handler root here.
	return (
		<GestureHandlerRootView
			pointerEvents={disabled ? "none" : "auto"}
			style={styles.pageControlRoot(pageWindow.width)}
		>
			<GestureDetector gesture={scrub}>
				<View
					accessible
					accessibilityActions={PAGE_CONTROL_ACTIONS}
					accessibilityLabel="Focused List"
					accessibilityRole="adjustable"
					accessibilityState={{ disabled }}
					accessibilityValue={{
						text: `${lists[focusedIndex]?.name ?? ""}, List ${focusedIndex + 1} of ${pageCount}`,
					}}
					onAccessibilityAction={adjustPage}
					style={[
						styles.pageControl,
						disabled ? styles.pageControlDisabled : undefined,
					]}
					testID="home-list-page-control"
				>
					{pageWindow.size < pageCount ? (
						<View style={styles.overflowGutter}>
							{pageWindow.overflowsBefore ? (
								<SymbolView
									name="chevron.left"
									size={PAGE_OVERFLOW_CHEVRON_SIZE}
									testID="home-list-page-overflow-before"
									tintColor={theme.colors.subtleForeground}
								/>
							) : null}
						</View>
					) : null}
					{lists
						.slice(pageWindow.start, pageWindow.start + pageWindow.size)
						.map((summary, slot) => (
							<View
								key={summary.id}
								style={styles.pageDotSlot}
								testID={`home-list-page-dot-${pageWindow.start + slot}`}
							>
								<View
									style={[
										styles.pageDot,
										pageWindow.start + slot === focusedIndex
											? styles.pageDotFocused
											: undefined,
									]}
								/>
							</View>
						))}
					{pageWindow.size < pageCount ? (
						<View style={styles.overflowGutter}>
							{pageWindow.overflowsAfter ? (
								<SymbolView
									name="chevron.right"
									size={PAGE_OVERFLOW_CHEVRON_SIZE}
									testID="home-list-page-overflow-after"
									tintColor={theme.colors.subtleForeground}
								/>
							) : null}
						</View>
					) : null}
				</View>
			</GestureDetector>
		</GestureHandlerRootView>
	);
}

/**
 * The List whose dot sits under `x`, measured from the left edge of the page
 * control. Anything past either end clamps to the window's end dot, so a drag
 * that runs off the strip parks on the window's first or last List instead of
 * stopping short. The Lists behind the window are reached by dragging again,
 * once lifting the finger has recentred the window.
 */
export function pageIndexAtX(
	x: number,
	windowStart: number,
	windowSize: number,
	leadingInset: number,
): number {
	// The scrub runs on the gesture's runtime, so the geometry it reads has to
	// run there too, without reaching for another module-scope function.
	"worklet";
	const slot = Math.floor((x - leadingInset) / PAGE_DOT_SLOT_WIDTH);
	return windowStart + Math.min(windowSize - 1, Math.max(0, slot));
}

export type PageControlWindow = {
	/** The List the window's first dot stands for. */
	start: number;
	/** How many Lists the window shows, one dot each. */
	size: number;
	width: number;
	/** Distance from the control's left edge to its first dot slot. */
	leadingInset: number;
	overflowsBefore: boolean;
	overflowsAfter: boolean;
};

/**
 * The strip drawn around a focused List. Up to the dots the strip can hold it is
 * the whole run of Lists at Weather's proportions; past that it is a window of
 * them, still at those proportions, centred on the focused List and pushed back
 * inside the Lists at either end so the strip always shows a full window, with a
 * gutter on each side holding the chevron for the Lists that side of the window.
 */
export function pageControlWindow(
	focusedIndex: number,
	pageCount: number,
): PageControlWindow {
	const size = Math.min(pageCount, PAGE_CONTROL_MAX_DOTS);
	const centred = focusedIndex - Math.floor((size - 1) / 2);
	const start = Math.min(pageCount - size, Math.max(0, centred));
	const leadingInset =
		PAGE_CONTROL_EDGE_SLOP +
		(size < pageCount ? PAGE_OVERFLOW_GUTTER_WIDTH : 0);

	return {
		start,
		size,
		width: size * PAGE_DOT_SLOT_WIDTH + leadingInset * 2,
		leadingInset,
		overflowsBefore: start > 0,
		overflowsAfter: start + size < pageCount,
	};
}

const styles = StyleSheet.create((theme) => ({
	// The toolbar hands this view straight to UIKit as a bar item, which sizes
	// the item from the view's own frame, so the root carries the size rather
	// than sizing to its content.
	pageControlRoot: (width: number) => ({
		width,
		height: PAGE_CONTROL_HEIGHT,
	}),
	pageControl: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: PAGE_CONTROL_EDGE_SLOP,
	},
	pageControlDisabled: {
		opacity: theme.opacities.disabled,
	},
	overflowGutter: {
		width: PAGE_OVERFLOW_GUTTER_WIDTH,
		alignItems: "center",
	},
	pageDotSlot: {
		width: PAGE_DOT_SLOT_WIDTH,
		alignItems: "center",
	},
	pageDot: {
		width: PAGE_DOT_SIZE,
		height: PAGE_DOT_SIZE,
		borderRadius: theme.radii.full,
		backgroundColor: theme.colors.subtleForeground,
	},
	pageDotFocused: {
		backgroundColor: theme.colors.foreground,
	},
}));
