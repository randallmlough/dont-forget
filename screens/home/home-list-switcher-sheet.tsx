import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
	presentationDetents,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import type { ReactElement } from "react";
import { StyleSheet } from "react-native-unistyles";

/**
 * Native bottom-sheet shell for the Home List switcher.
 *
 * The subtree is mounted only while the switcher is open, so `isPresented` is
 * constant `true`; a native dismissal (swipe down, scrim tap) reports
 * `isPresented: false` and the owner unmounts the sheet via `onDismiss`.
 *
 * Detents (medium/large) size the sheet — never fit-to-content/match-contents,
 * which misbehaves with variable row counts. The hosted React Native content
 * fills the detent and scrolls internally.
 *
 * This is the only file that touches `@expo/ui`; if simulator QA disproves
 * `BottomSheet`/`RNHostView`, swap this file for an RN `Modal` shell with the
 * same `{ onDismiss, children }` contract.
 */
export function HomeListSwitcherSheet({
	onDismiss,
	children,
}: {
	onDismiss: () => void;
	children: ReactElement;
}) {
	return (
		<Host style={styles.host}>
			<BottomSheet
				isPresented
				onIsPresentedChange={(isPresented) => {
					if (!isPresented) onDismiss();
				}}
			>
				<Group
					modifiers={[
						presentationDetents(["medium", "large"]),
						presentationDragIndicator("visible"),
					]}
				>
					<RNHostView>{children}</RNHostView>
				</Group>
			</BottomSheet>
		</Host>
	);
}

const styles = StyleSheet.create(() => ({
	host: {
		position: "absolute",
	},
}));
