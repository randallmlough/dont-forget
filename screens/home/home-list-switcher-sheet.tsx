import type { ReactElement } from "react";
import { Modal } from "react-native";

/**
 * Native bottom-sheet shell for the Home List switcher.
 *
 * The subtree is mounted only while the switcher is open, so `visible` is
 * constant `true`; a native swipe-down dismissal fires `onRequestClose` and
 * the owner unmounts the sheet via `onDismiss`.
 *
 * `pageSheet` is a UIKit large-detent sheet (UISheetPresentationController),
 * so the hosted React Native content gets a real bounded height and the row
 * ScrollView scrolls natively within it.
 *
 * This file replaced an `@expo/ui` BottomSheet/RNHostView shell: simulator QA
 * proved RNHostView's bidirectional size negotiation with Yoga
 * nondeterministically settles at fit-to-content height (frame == content
 * size), which makes the row ScrollView unscrollable and clips overflow rows.
 * See worker-notes (attempt 2) for the live evidence.
 */
export function HomeListSwitcherSheet({
	onDismiss,
	children,
}: {
	onDismiss: () => void;
	children: ReactElement;
}) {
	return (
		<Modal
			visible
			animationType="slide"
			presentationStyle="pageSheet"
			allowSwipeDismissal
			onRequestClose={onDismiss}
		>
			{children}
		</Modal>
	);
}
