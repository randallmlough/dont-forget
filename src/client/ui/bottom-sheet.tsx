import {
	BottomSheet as ExpoBottomSheet,
	type BottomSheetProps as ExpoBottomSheetProps,
	RNHostView,
} from "@expo/ui";
import { presentationBackground } from "@expo/ui/swift-ui/modifiers";
import { type ReactNode, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export type BottomSheetSnapPoint = NonNullable<
	ExpoBottomSheetProps["snapPoints"]
>[number];

export type BottomSheetHeader = {
	title: string;
	leadingAction?: ReactNode;
	trailingAction?: ReactNode;
};

export type BottomSheetProps = {
	children: ReactNode;
	header?: BottomSheetHeader;
	isPresented: boolean;
	onIsPresentedChange: (isPresented: boolean) => void;
	showDragIndicator?: boolean;
	snapPoints?: BottomSheetSnapPoint[];
	testID?: string;
};

/**
 * App-owned wrapper around Expo UI's universal native bottom sheet.
 *
 * React Native content is hosted inside Expo UI here so callers do not need to
 * know about the native host boundary. The native container and its latest
 * content stay mounted through dismissal so SwiftUI can animate the sheet down;
 * children unmount after the native dismissal finishes.
 */
export function BottomSheet({
	children,
	header,
	isPresented,
	onIsPresentedChange,
	showDragIndicator = true,
	snapPoints,
	testID,
}: BottomSheetProps) {
	const { theme } = useUnistyles();
	const hasSnapPoints = snapPoints !== undefined && snapPoints.length > 0;
	const [retainedContent, setRetainedContent] = useState({ children, header });
	const [nativeDismissed, setNativeDismissed] = useState(!isPresented);

	useEffect(() => {
		if (!isPresented) return;
		// The last presented React tree is the snapshot SwiftUI animates down
		// after a controlled close clears the caller's current children.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setRetainedContent({ children, header });
	}, [children, header, isPresented]);

	useEffect(() => {
		if (!isPresented) return;
		// A new native presentation starts a fresh dismissal lifecycle.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setNativeDismissed(false);
	}, [isPresented]);

	const content = isPresented ? { children, header } : retainedContent;
	const renderContent = isPresented || !nativeDismissed;

	return (
		<ExpoBottomSheet
			isPresented={isPresented}
			modifiers={[presentationBackground(theme.colors.background)]}
			onDismiss={() => {
				setNativeDismissed(true);
				onIsPresentedChange(false);
			}}
			showDragIndicator={showDragIndicator}
			snapPoints={snapPoints}
			testID={testID}
		>
			{renderContent ? (
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
			) : null}
		</ExpoBottomSheet>
	);
}

const styles = StyleSheet.create((theme) => ({
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
