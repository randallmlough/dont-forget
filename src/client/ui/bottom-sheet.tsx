import {
	BottomSheet as ExpoBottomSheet,
	type BottomSheetProps as ExpoBottomSheetProps,
	RNHostView,
} from "@expo/ui";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export type BottomSheetSnapPoint = NonNullable<
	ExpoBottomSheetProps["snapPoints"]
>[number];

type BottomSheetHeaderProps =
	| {
			headerAction?: ReactNode;
			title: string;
	  }
	| {
			headerAction?: never;
			title?: never;
	  };

export type BottomSheetProps = BottomSheetHeaderProps & {
	children: ReactNode;
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
	headerAction,
	isPresented,
	onIsPresentedChange,
	showDragIndicator = true,
	snapPoints,
	testID,
	title,
}: BottomSheetProps) {
	if (!isPresented) {
		return null;
	}

	const hasSnapPoints = snapPoints !== undefined && snapPoints.length > 0;

	return (
		<ExpoBottomSheet
			isPresented
			onDismiss={() => onIsPresentedChange(false)}
			showDragIndicator={showDragIndicator}
			snapPoints={snapPoints}
			testID={testID}
		>
			<RNHostView matchContents={!hasSnapPoints}>
				<View
					style={[styles.sheet, hasSnapPoints ? styles.boundedSheet : null]}
				>
					{title !== undefined ? (
						<View style={styles.header}>
							<Text accessibilityRole="header" style={styles.title}>
								{title}
							</Text>
							{headerAction}
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
	},
	boundedSheet: {
		flex: 1,
	},
	header: {
		minHeight: theme.spacing(11),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	title: {
		...theme.typography.headline,
		minWidth: 0,
		flex: 1,
		color: theme.colors.foreground,
	},
	content: {
		gap: theme.spacing(4),
	},
	boundedContent: {
		flex: 1,
	},
}));
