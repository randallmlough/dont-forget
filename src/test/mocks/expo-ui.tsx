import type { ReactElement, ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

type MockBottomSheetProps = {
	children?: ReactNode;
	isPresented: boolean;
	onDismiss: () => void;
	showDragIndicator?: boolean;
	snapPoints?: unknown[];
	testID?: string;
};

type MockRNHostViewProps = {
	children: ReactElement;
	matchContents?: boolean;
};

export function BottomSheet({
	children,
	isPresented,
	onDismiss,
	showDragIndicator,
	snapPoints,
	testID,
}: MockBottomSheetProps) {
	if (!isPresented) {
		return null;
	}

	return (
		<View
			accessibilityValue={{
				text: JSON.stringify({ showDragIndicator, snapPoints }),
			}}
			testID={testID ?? "expo-bottom-sheet"}
		>
			<Pressable
				accessibilityLabel="Dismiss bottom sheet"
				accessibilityRole="button"
				onPress={onDismiss}
			>
				<Text>Dismiss bottom sheet</Text>
			</Pressable>
			{children}
		</View>
	);
}

export function RNHostView({
	children,
	matchContents = false,
}: MockRNHostViewProps) {
	return (
		<View
			accessibilityValue={{
				text: matchContents ? "match contents" : "fill",
			}}
			testID="expo-rn-host-view"
		>
			{children}
		</View>
	);
}
