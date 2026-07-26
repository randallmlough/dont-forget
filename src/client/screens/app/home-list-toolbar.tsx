import * as Haptics from "expo-haptics";
import { Stack } from "expo-router";
import { type AccessibilityActionEvent, View } from "react-native";
import {
	Gesture,
	GestureDetector,
	GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import type { ListSummary } from "@/client/features/list/list-service";

/**
 * Physical geometry of the page control, not design tokens.
 *
 * The dots are Weather's proportions: small marks in a compact strip, each
 * sitting in a slot wide enough that dragging across the strip reads one List
 * per slot. The strip fills a full touch-target height even though the dots
 * themselves are tiny, and it keeps a slot's worth of slop past the end dots so
 * the first and last List stay reachable at the edges of the drag.
 *
 * Nothing caps how many Lists a Household keeps, so the strip also needs a
 * ceiling. The toolbar hands this view to UIKit as a bar item sized from its own
 * frame: a strip wider than the space between the Search and Choose List buttons
 * clips itself or its neighbours instead of wrapping. On the narrowest supported
 * iPhone (375pt) those two buttons plus the bar's own margins leave roughly
 * 255pt, and holding ~24pt of breathing room on each side leaves 208pt, which is
 * exactly twelve slots at Weather's proportions. Past twelve Lists the slots
 * compress inside that width, and the dots shrink with them down to a floor that
 * keeps a dot visible.
 */
const PAGE_DOT_SIZE = 7;
const PAGE_DOT_MIN_SIZE = 4;
const PAGE_DOT_SLOT_WIDTH = 16;
const PAGE_CONTROL_HEIGHT = 44;
const PAGE_CONTROL_EDGE_SLOP = 8;
const PAGE_CONTROL_MAX_WIDTH = 208;

const PAGE_CONTROL_ACTIONS = [{ name: "increment" }, { name: "decrement" }];

export type HomeListToolbarProps = {
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
				icon="list.bullet"
				onPress={onOpenPicker}
			/>
		</Stack.Toolbar>
	);
}

/**
 * One dot per List, with Weather's scrub: dragging across the dots switches
 * Lists under the finger with a tick per List, and the switch is instant
 * because only the landing List is written back when the finger lifts.
 */
function HomeListPageControl({
	focusedIndex,
	lists,
	onCommitPage,
	onScrubToPage,
}: {
	focusedIndex: number;
	lists: readonly ListSummary[];
	onCommitPage: (index: number) => void;
	onScrubToPage: (index: number) => void;
}) {
	const pageCount = lists.length;
	const { width, slotWidth, dotSize } = pageControlGeometry(pageCount);
	// Where the drag sits, tracked on the gesture's own runtime: a scrub tick
	// can tell a new List from a repeat without waiting for React to rerender,
	// and a press with no travel still commits the List it landed on rather
	// than the one this control was last rendered with.
	const scrubbedIndex = useSharedValue(focusedIndex);

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

	function adjustPage(event: AccessibilityActionEvent) {
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
			scrubTo(pageIndexAtX(event.x, slotWidth, pageCount));
		})
		.onUpdate((event) => {
			"worklet";
			scrubTo(pageIndexAtX(event.x, slotWidth, pageCount));
		})
		.onFinalize(() => {
			"worklet";
			scheduleOnRN(onCommitPage, scrubbedIndex.get());
		});

	// The toolbar hosts this view outside the app's view tree, so the gesture
	// needs its own gesture-handler root here.
	return (
		<GestureHandlerRootView style={styles.pageControlRoot(width)}>
			<GestureDetector gesture={scrub}>
				<View
					accessible
					accessibilityActions={PAGE_CONTROL_ACTIONS}
					accessibilityLabel="Focused List"
					accessibilityRole="adjustable"
					accessibilityValue={{
						text: `${lists[focusedIndex]?.name ?? ""}, List ${focusedIndex + 1} of ${pageCount}`,
					}}
					onAccessibilityAction={adjustPage}
					style={styles.pageControl}
					testID="home-list-page-control"
				>
					{lists.map((summary, index) => (
						<View key={summary.id} style={styles.pageDotSlot(slotWidth)}>
							<View
								style={[
									styles.pageDot(dotSize),
									index === focusedIndex ? styles.pageDotFocused : undefined,
								]}
							/>
						</View>
					))}
				</View>
			</GestureDetector>
		</GestureHandlerRootView>
	);
}

/**
 * The List whose dot sits under `x`, measured from the left edge of the page
 * control. Anything past either end clamps to the end dot, so a drag that runs
 * off the strip parks on the first or last List instead of stopping short.
 *
 * `slotWidth` comes from `pageControlGeometry`, so a compressed strip still
 * reads one List per slot and its last Lists stay under the finger.
 */
export function pageIndexAtX(
	x: number,
	slotWidth: number,
	pageCount: number,
): number {
	// The scrub runs on the gesture's runtime, so the geometry it reads has to
	// run there too, without reaching for another module-scope function.
	"worklet";
	const slot = Math.floor((x - PAGE_CONTROL_EDGE_SLOP) / slotWidth);
	return Math.min(pageCount - 1, Math.max(0, slot));
}

export type PageControlGeometry = {
	width: number;
	slotWidth: number;
	dotSize: number;
};

/**
 * How wide the strip is and how it splits between the Lists. Up to the width the
 * toolbar can host, every List gets Weather's slot and Weather's dot. Past it
 * the width stops growing and the same slots divide the strip instead, so every
 * List keeps a slot of its own to be scrubbed onto however many there are.
 */
export function pageControlGeometry(pageCount: number): PageControlGeometry {
	const naturalWidth =
		pageCount * PAGE_DOT_SLOT_WIDTH + PAGE_CONTROL_EDGE_SLOP * 2;
	if (naturalWidth <= PAGE_CONTROL_MAX_WIDTH) {
		return {
			width: naturalWidth,
			slotWidth: PAGE_DOT_SLOT_WIDTH,
			dotSize: PAGE_DOT_SIZE,
		};
	}

	const slotWidth =
		(PAGE_CONTROL_MAX_WIDTH - PAGE_CONTROL_EDGE_SLOP * 2) / pageCount;
	return {
		width: PAGE_CONTROL_MAX_WIDTH,
		slotWidth,
		// The dot keeps Weather's share of its slot until that share stops being
		// visible, then holds the floor. A dot never outgrows its slot, so at the
		// counts where even the floor no longer fits the strip closes into a bar
		// rather than overlapping itself.
		dotSize: Math.min(
			slotWidth,
			Math.max(
				PAGE_DOT_MIN_SIZE,
				(slotWidth * PAGE_DOT_SIZE) / PAGE_DOT_SLOT_WIDTH,
			),
		),
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
	pageDotSlot: (width: number) => ({
		width,
		alignItems: "center",
	}),
	pageDot: (size: number) => ({
		width: size,
		height: size,
		borderRadius: theme.radii.full,
		backgroundColor: theme.colors.subtleForeground,
	}),
	pageDotFocused: {
		backgroundColor: theme.colors.foreground,
	},
}));
