import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useEffect, useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/**
 * App-owned toast primitive: a module-level store plus a `Toaster` viewport
 * that renders the newest toasts as a stack of cards below the top safe area.
 * Cards drop in from the top edge, older ones recede back toward it, and an
 * upward swipe flicks a card away.
 *
 * Consumers mount `<Toaster />` exactly once, as the last child of the app
 * root so it paints above screen content, and then raise toasts imperatively
 * from anywhere: `toast.success("Item added")`.
 *
 * The swipe gesture needs a `GestureHandlerRootView` ancestor above the
 * mounted `<Toaster />`.
 *
 * The store lives at module scope on purpose — raising a toast must not
 * require a provider, a ref, or prop drilling from the code that just did the
 * thing worth reporting.
 */

/** Newest-first cards kept on screen; older toasts are dropped. */
const TOAST_LIMIT = 3;
const DEFAULT_DURATION_MS = 4000;
const ENTER_DURATION_MS = 200;
/** Also how long a dismissed toast stays in the store so it can fade out. */
const EXIT_DURATION_MS = 150;
/** Vertical offset, in points, between one stacked card and the next. */
const STACK_GAP = 14;
/** How much smaller each card behind the front one is drawn. */
const STACK_SCALE_STEP = 0.05;
/** Distance, in points, a card drops through while it fades in. */
const ENTER_DROP = 20;
/** Finger travel, in points, before the swipe takes over, so taps still land. */
const PAN_ACTIVATION_OFFSET = 8;
/** Upward drag past this distance, in points, dismisses the card. */
const SWIPE_DISMISS_DISTANCE = 48;
/** Upward fling faster than this, in points per second, also dismisses it. */
const SWIPE_DISMISS_VELOCITY = 600;
/** How far, in points, a flicked card keeps travelling past the top edge. */
const SWIPE_EXIT_TRAVEL = 160;
/** Toasts only leave through the top; downward drags just rubber-band. */
const DOWNWARD_DRAG_RESISTANCE = 0.2;

/** Decides a swipe's outcome from where and how fast the finger left the card. */
export function shouldDismissOnSwipe(
	translationY: number,
	velocityY: number,
): boolean {
	"worklet";

	return (
		translationY < -SWIPE_DISMISS_DISTANCE ||
		velocityY < -SWIPE_DISMISS_VELOCITY
	);
}

export type ToastType =
	| "normal"
	| "success"
	| "info"
	| "warning"
	| "error"
	| "loading";

export type ToastAction = {
	label: string;
	onPress: () => void;
};

export type ToastOptions = {
	description?: string;
	type?: ToastType;
	action?: ToastAction;
	/** Milliseconds on screen; `Number.POSITIVE_INFINITY` disables auto-close. */
	duration?: number;
	onDismiss?: () => void;
	onAutoClose?: () => void;
};

export type Toast = ToastOptions & {
	id: string;
	title: string;
	/** `false` once dismissed: the card fades out before it is removed. */
	open: boolean;
};

export type ToastState = {
	toasts: readonly Toast[];
};

export type ToastTransition =
	| { type: "toastShown"; toast: Toast }
	| { type: "toastDismissed"; toastId?: string }
	| { type: "toastRemoved"; toastId: string };

export function toastsReducer(
	state: ToastState,
	transition: ToastTransition,
): ToastState {
	switch (transition.type) {
		case "toastShown":
			return {
				toasts: [transition.toast, ...state.toasts].slice(0, TOAST_LIMIT),
			};
		case "toastDismissed":
			return {
				toasts: state.toasts.map((toast) =>
					transition.toastId === undefined || toast.id === transition.toastId
						? { ...toast, open: false }
						: toast,
				),
			};
		case "toastRemoved":
			return {
				toasts: state.toasts.filter((toast) => toast.id !== transition.toastId),
			};
	}
}

let toastState: ToastState = { toasts: [] };
const listeners = new Set<() => void>();
const removalTimers = new Map<string, ReturnType<typeof setTimeout>>();
let lastToastCount = 0;

function dispatch(transition: ToastTransition) {
	toastState = toastsReducer(toastState, transition);
	for (const listener of listeners) {
		listener();
	}
}

function subscribeToToasts(listener: () => void) {
	listeners.add(listener);

	return () => {
		listeners.delete(listener);
	};
}

function getToastState(): ToastState {
	return toastState;
}

function useToasts(): readonly Toast[] {
	return useSyncExternalStore(subscribeToToasts, getToastState).toasts;
}

function scheduleRemoval(toastId: string) {
	if (removalTimers.has(toastId)) {
		return;
	}

	removalTimers.set(
		toastId,
		setTimeout(() => {
			removalTimers.delete(toastId);
			dispatch({ type: "toastRemoved", toastId });
		}, EXIT_DURATION_MS),
	);
}

function nextToastId(): string {
	lastToastCount = (lastToastCount + 1) % Number.MAX_SAFE_INTEGER;

	return lastToastCount.toString();
}

function showToast(title: string, options?: ToastOptions): string {
	const id = nextToastId();

	dispatch({
		type: "toastShown",
		toast: { ...options, id, title, open: true },
	});

	return id;
}

/** Dismisses one toast, or every toast when no id is given. */
function dismissToast(toastId?: string) {
	const dismissed = toastState.toasts.filter(
		(toast) => toast.open && (toastId === undefined || toast.id === toastId),
	);

	if (dismissed.length === 0) {
		return;
	}

	dispatch({ type: "toastDismissed", toastId });

	for (const toast of dismissed) {
		scheduleRemoval(toast.id);
		toast.onDismiss?.();
	}
}

function showTypedToast(type: ToastType) {
	return (title: string, options?: ToastOptions) =>
		showToast(title, { ...options, type });
}

export const toast = Object.assign(showToast, {
	message: showTypedToast("normal"),
	success: showTypedToast("success"),
	error: showTypedToast("error"),
	info: showTypedToast("info"),
	warning: showTypedToast("warning"),
	dismiss: dismissToast,
});

export function Toaster() {
	const toasts = useToasts();
	const insets = useSafeAreaInsets();
	const { theme } = useUnistyles();

	if (toasts.length === 0) {
		return null;
	}

	// Cards are absolutely stacked, so the last child paints on top: render the
	// newest toast last so the front-most card stays above the ones behind it.
	const stacked = toasts
		.map((item, stackIndex) => ({ item, stackIndex }))
		.reverse();

	return (
		<View pointerEvents="box-none" style={styles.viewport}>
			{stacked.map(({ item, stackIndex }) => (
				<ToastCard
					key={item.id}
					stackIndex={stackIndex}
					toast={item}
					topOffset={insets.top + theme.spacing(5)}
				/>
			))}
		</View>
	);
}

function ToastCard({
	stackIndex,
	toast: item,
	topOffset,
}: {
	stackIndex: number;
	toast: Toast;
	topOffset: number;
}) {
	const visibility = useSharedValue(0);
	const depth = useSharedValue(stackIndex);
	const drag = useSharedValue(0);
	const { action, duration, id, onAutoClose, open } = item;

	useEffect(() => {
		visibility.set(
			withTiming(open ? 1 : 0, {
				duration: open ? ENTER_DURATION_MS : EXIT_DURATION_MS,
			}),
		);
	}, [open, visibility]);

	useEffect(() => {
		depth.set(withSpring(stackIndex));
	}, [depth, stackIndex]);

	useEffect(() => {
		if (!open || duration === Number.POSITIVE_INFINITY) {
			return;
		}

		const timer = setTimeout(() => {
			onAutoClose?.();
			dismissToast(id);
		}, duration ?? DEFAULT_DURATION_MS);

		return () => clearTimeout(timer);
	}, [duration, id, onAutoClose, open]);

	const animatedStyle = useAnimatedStyle(() => {
		const currentVisibility = visibility.get();
		const currentDepth = depth.get();

		return {
			opacity: currentVisibility,
			transform: [
				{
					translateY:
						currentDepth * -STACK_GAP -
						(1 - currentVisibility) * ENTER_DROP +
						drag.get(),
				},
				{ scale: 1 - currentDepth * STACK_SCALE_STEP },
			],
		};
	});

	// Gesture callbacks are worklets: the drag maths stays on the UI thread and
	// only the dismissal itself hops back to JS.
	const swipe = Gesture.Pan()
		.activeOffsetY([-PAN_ACTIVATION_OFFSET, PAN_ACTIVATION_OFFSET])
		.onUpdate((event) => {
			drag.set(
				event.translationY < 0
					? event.translationY
					: event.translationY * DOWNWARD_DRAG_RESISTANCE,
			);
		})
		.onEnd((event) => {
			if (shouldDismissOnSwipe(event.translationY, event.velocityY)) {
				// Keep travelling off the top edge instead of snapping back, so the
				// store's fade-out plays where the card already is.
				drag.set(
					withTiming(-SWIPE_EXIT_TRAVEL, { duration: EXIT_DURATION_MS }),
				);
				runOnJS(dismissToast)(id);
				return;
			}

			drag.set(withSpring(0));
		});

	return (
		<GestureDetector gesture={swipe}>
			<Animated.View
				accessibilityActions={dismissAccessibilityActions}
				accessibilityRole="alert"
				onAccessibilityAction={(event) => {
					if (event.nativeEvent.actionName === "escape") {
						dismissToast(id);
					}
				}}
				style={[styles.card, { top: topOffset }, animatedStyle]}
			>
				<ToastIcon type={item.type ?? "normal"} />
				<View style={styles.content}>
					<Text style={styles.title}>{item.title}</Text>
					{item.description ? (
						<Text style={styles.description}>{item.description}</Text>
					) : null}
				</View>
				{action ? (
					<Pressable
						accessibilityRole="button"
						onPress={() => {
							action.onPress();
							dismissToast(id);
						}}
						style={({ pressed }) => [
							styles.actionButton,
							pressed ? styles.actionButtonPressed : undefined,
						]}
					>
						<Text style={styles.actionLabel}>{action.label}</Text>
					</Pressable>
				) : null}
			</Animated.View>
		</GestureDetector>
	);
}

/** VoiceOver's two-finger scrub reaches the same dismissal as the swipe. */
const dismissAccessibilityActions = [{ name: "escape", label: "Dismiss" }];

type IconToastType = Exclude<ToastType, "normal" | "loading">;

const TOAST_ICON_SYMBOLS: Record<IconToastType, SymbolViewProps["name"]> = {
	success: "checkmark.circle.fill",
	error: "xmark.circle.fill",
	info: "info.circle.fill",
	warning: "exclamationmark.triangle.fill",
};

const TOAST_ICON_TONES: Record<IconToastType, "primary" | "destructive"> = {
	success: "primary",
	error: "destructive",
	info: "primary",
	warning: "destructive",
};

function ToastIcon({ type }: { type: ToastType }) {
	const { theme } = useUnistyles();

	if (type === "normal") {
		return null;
	}

	if (type === "loading") {
		return (
			<ActivityIndicator color={theme.colors.mutedForeground} size="small" />
		);
	}

	return (
		<SymbolView
			accessibilityElementsHidden
			accessible={false}
			name={TOAST_ICON_SYMBOLS[type]}
			size={theme.spacing(4.5)}
			tintColor={theme.colors[TOAST_ICON_TONES[type]]}
			weight="medium"
		/>
	);
}

const styles = StyleSheet.create((theme) => ({
	// Full-screen so cards stay inside their parent's bounds and keep receiving
	// touches; `box-none` keeps the uncovered area interactive.
	viewport: {
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
	},
	card: {
		position: "absolute",
		right: theme.spacing(5),
		left: theme.spacing(5),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		padding: theme.spacing(4),
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		borderRadius: theme.radii.lg,
		borderCurve: "continuous",
		backgroundColor: theme.colors.card,
	},
	content: {
		flex: 1,
		minWidth: 0,
		gap: theme.spacing(1),
	},
	title: {
		...theme.typography.callout,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.cardForeground,
	},
	description: {
		...theme.typography.caption,
		color: theme.colors.mutedForeground,
	},
	actionButton: {
		flexShrink: 0,
		minHeight: theme.spacing(11),
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: theme.spacing(3),
		paddingVertical: theme.spacing(1.5),
		borderRadius: theme.radii.md,
		borderCurve: "continuous",
		backgroundColor: theme.colors.primary,
	},
	actionButtonPressed: {
		opacity: theme.opacities.pressed,
	},
	actionLabel: {
		...theme.typography.caption,
		fontWeight: theme.fontWeights.medium,
		color: theme.colors.primaryForeground,
	},
}));
