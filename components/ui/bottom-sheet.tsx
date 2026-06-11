import type { ReactElement } from "react";
import { Modal } from "react-native";

/**
 * App-owned bottom-sheet primitive. Every sheet in the app goes through this
 * component (see `docs/code-standards/ui-composition.md`) so the sheet
 * implementation has a single swap point.
 *
 * Contract — implementations may change, this may not:
 * - Children are mounted only while presented: `isPresented: false` renders
 *   nothing. Owner components rely on unmount-on-close to reset per-open
 *   state (the Home switcher's mode/rows do).
 * - A native swipe-down dismissal fires `onIsPresentedChange(false)`.
 *
 * Current internals: `pageSheet` is a UIKit large-detent sheet
 * (UISheetPresentationController), so the hosted React Native content gets a
 * real bounded height and row ScrollViews scroll natively within it.
 *
 * These internals replaced an `@expo/ui` BottomSheet/RNHostView shell:
 * simulator QA proved RNHostView's bidirectional size negotiation with Yoga
 * nondeterministically settles at fit-to-content height (frame == content
 * size), which makes row ScrollViews unscrollable and clips overflow rows.
 *
 * Swap plan: on the Expo SDK 56 upgrade, reimplement these internals over
 * `@expo/ui/community/bottom-sheet` behind this same prop surface —
 * `BottomSheetModal` presented/dismissed from `isPresented` via an effect,
 * explicit `snapPoints` such as `['50%', '90%']` to restore the medium
 * detent, and `BottomSheetScrollView` for row lists. Content stays in React
 * Native (no RNHostView), so the defect class above cannot recur. Acceptance
 * gate: the live QA in `ui-composition.md` must pass again, especially the
 * many-Lists (13+) scroll check.
 */
export type BottomSheetProps = {
	children: ReactElement;
	isPresented: boolean;
	onIsPresentedChange: (isPresented: boolean) => void;
};

export function BottomSheet({
	children,
	isPresented,
	onIsPresentedChange,
}: BottomSheetProps) {
	if (!isPresented) {
		return null;
	}

	return (
		<Modal
			visible
			animationType="slide"
			presentationStyle="pageSheet"
			allowSwipeDismissal
			onRequestClose={() => onIsPresentedChange(false)}
		>
			{children}
		</Modal>
	);
}
