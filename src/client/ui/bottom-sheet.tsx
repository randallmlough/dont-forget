import {
	BottomSheet as ExpoBottomSheet,
	Group,
	Host,
	RNHostView,
} from "@expo/ui/swift-ui";
import {
	interactiveDismissDisabled as disableInteractiveDismiss,
	frame,
	type PresentationDetent,
	padding,
	presentationBackground,
	presentationDetents,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import { type ReactNode, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export type BottomSheetSnapPoint =
	| "half"
	| "full"
	| { fraction: number }
	| { height: number };

export type BottomSheetHeader = {
	title: string;
	leadingAction?: ReactNode;
	trailingAction?: ReactNode;
};

export type BottomSheetProps = {
	children: ReactNode;
	header?: BottomSheetHeader;
	interactiveDismissDisabled?: boolean;
	isPresented: boolean;
	onDismiss?: () => void;
	onIsPresentedChange: (isPresented: boolean) => void;
	showDragIndicator?: boolean;
	snapPoints?: BottomSheetSnapPoint[];
	testID?: string;
};

/**
 * App-owned wrapper around Expo UI's low-level SwiftUI bottom sheet.
 *
 * React Native content is hosted inside Expo UI here so callers do not need to
 * know about the native host boundary. The native container and its latest
 * content stay mounted through dismissal so SwiftUI can animate the sheet down;
 * children unmount after the native dismissal finishes.
 */
export function BottomSheet({
	children,
	header,
	interactiveDismissDisabled = false,
	isPresented,
	onDismiss,
	onIsPresentedChange,
	showDragIndicator = true,
	snapPoints,
	testID,
}: BottomSheetProps) {
	const { theme } = useUnistyles();
	const hasSnapPoints = snapPoints !== undefined && snapPoints.length > 0;
	const [retainedContent, setRetainedContent] = useState({ children, header });

	if (
		isPresented &&
		(retainedContent.children !== children || retainedContent.header !== header)
	) {
		// The last presented React tree is the snapshot SwiftUI animates down
		// after a controlled close clears the caller's current children. Expo's
		// low-level BottomSheet owns the native isMounted lifecycle and unmounts
		// this retained tree only after its native onDismiss callback.
		setRetainedContent({ children, header });
	}

	const modifiers = useMemo(
		() => [
			frame({ maxWidth: Infinity, alignment: "topLeading" }),
			padding({ top: 16, leading: 16, trailing: 16 }),
			presentationDragIndicator(showDragIndicator ? "visible" : "hidden"),
			...(hasSnapPoints
				? [presentationDetents(snapPoints.map(snapPointToDetent))]
				: []),
			presentationBackground(theme.colors.background),
			...(interactiveDismissDisabled ? [disableInteractiveDismiss()] : []),
		],
		[
			hasSnapPoints,
			interactiveDismissDisabled,
			showDragIndicator,
			snapPoints,
			theme.colors.background,
		],
	);
	const content = isPresented ? { children, header } : retainedContent;

	return (
		<Host pointerEvents="none" style={styles.nativeHost}>
			<ExpoBottomSheet
				fitToContents={!hasSnapPoints}
				isPresented={isPresented}
				onDismiss={onDismiss}
				onIsPresentedChange={onIsPresentedChange}
				testID={testID}
			>
				<Group modifiers={modifiers}>
					<RNHostView matchContents={!hasSnapPoints}>
						<View
							style={[styles.sheet, hasSnapPoints ? styles.boundedSheet : null]}
						>
							{content.header ? (
								<View style={styles.header}>
									<View style={styles.headerAction}>
										{content.header.leadingAction}
									</View>
									<Text accessibilityRole="header" style={styles.title}>
										{content.header.title}
									</Text>
									<View style={styles.headerAction}>
										{content.header.trailingAction}
									</View>
								</View>
							) : null}
							<View
								style={[
									styles.content,
									hasSnapPoints ? styles.boundedContent : null,
								]}
							>
								{content.children}
							</View>
						</View>
					</RNHostView>
				</Group>
			</ExpoBottomSheet>
		</Host>
	);
}

function snapPointToDetent(
	snapPoint: BottomSheetSnapPoint,
): PresentationDetent {
	if (snapPoint === "half") return "medium";
	if (snapPoint === "full") return "large";
	return snapPoint;
}

const styles = StyleSheet.create((theme) => ({
	nativeHost: {
		position: "absolute",
	},
	sheet: {
		gap: theme.spacing(3),
		paddingBottom: theme.spacing(4),
		backgroundColor: theme.colors.background,
	},
	boundedSheet: {
		flex: 1,
	},
	header: {
		minHeight: theme.spacing(11),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(3),
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	headerAction: {
		width: theme.spacing(11),
		alignItems: "center",
		justifyContent: "center",
	},
	title: {
		...theme.typography.headline,
		minWidth: 0,
		flex: 1,
		color: theme.colors.foreground,
		textAlign: "center",
	},
	content: {
		gap: theme.spacing(4),
	},
	boundedContent: {
		flex: 1,
	},
}));
