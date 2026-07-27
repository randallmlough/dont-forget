import {
	BottomSheet as ExpoBottomSheet,
	type BottomSheetProps as ExpoBottomSheetProps,
	RNHostView,
} from "@expo/ui";
import { presentationBackground } from "@expo/ui/swift-ui/modifiers";
import type { ReactNode } from "react";
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
 * know about the native host boundary. Children unmount when the sheet closes,
 * which lets owners keep per-presentation state inside the sheet.
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

	if (!isPresented) {
		return null;
	}

	const hasSnapPoints = snapPoints !== undefined && snapPoints.length > 0;

	return (
		<ExpoBottomSheet
			isPresented
			modifiers={[presentationBackground(theme.colors.background)]}
			onDismiss={() => onIsPresentedChange(false)}
			showDragIndicator={showDragIndicator}
			snapPoints={snapPoints}
			testID={testID}
		>
			<RNHostView matchContents={!hasSnapPoints}>
				<View
					style={[styles.sheet, hasSnapPoints ? styles.boundedSheet : null]}
				>
					{header ? (
						<View style={styles.header}>
							<View style={styles.headerAction}>{header.leadingAction}</View>
							<Text accessibilityRole="header" style={styles.title}>
								{header.title}
							</Text>
							<View style={styles.headerAction}>{header.trailingAction}</View>
						</View>
					) : null}
					<View
						style={[
							styles.content,
							hasSnapPoints ? styles.boundedContent : null,
						]}
					>
						{children}
					</View>
				</View>
			</RNHostView>
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
