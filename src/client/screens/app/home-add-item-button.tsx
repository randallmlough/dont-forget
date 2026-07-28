import { useEffect, useState } from "react";
import {
	Keyboard,
	type KeyboardEvent,
	useWindowDimensions,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ButtonIconGlass } from "@/client/ui/button-icon-glass";

export type HomeAddItemButtonProps = {
	editorActive: boolean;
	finishing: boolean;
	onAddItem: () => void;
	onFinishEditing: () => void;
};

export function HomeAddItemButton({
	editorActive,
	finishing,
	onAddItem,
	onFinishEditing,
}: HomeAddItemButtonProps) {
	const insets = useSafeAreaInsets();
	const { theme } = useUnistyles();
	const { height: windowHeight } = useWindowDimensions();
	const restingBottomOffset = insets.bottom + theme.spacing(16);
	const keyboardGap = theme.spacing(2);
	const [bottomOffset, setBottomOffset] = useState(restingBottomOffset);

	useEffect(() => {
		function moveAboveKeyboard(event: KeyboardEvent) {
			Keyboard.scheduleLayoutAnimation(event);
			setBottomOffset(
				windowHeight - event.endCoordinates.screenY + keyboardGap,
			);
		}

		function moveToRestingPosition(event: KeyboardEvent) {
			Keyboard.scheduleLayoutAnimation(event);
			setBottomOffset(restingBottomOffset);
		}

		const showSubscription = Keyboard.addListener(
			"keyboardWillShow",
			moveAboveKeyboard,
		);
		const hideSubscription = Keyboard.addListener(
			"keyboardWillHide",
			moveToRestingPosition,
		);
		return () => {
			showSubscription.remove();
			hideSubscription.remove();
		};
	}, [keyboardGap, restingBottomOffset, windowHeight]);

	return (
		<View
			pointerEvents="box-none"
			style={styles.position(bottomOffset)}
			testID="home-add-item-button-keyboard-layer"
		>
			<ButtonIconGlass
				accessibilityHint={
					editorActive
						? "Saves valid changes and dismisses the Item editor"
						: "Starts adding Items to the Current List"
				}
				accessibilityLabel={editorActive ? "Finish editing Item" : "Add Item"}
				disabled={finishing}
				iconRotation={editorActive ? 45 : 0}
				onPress={editorActive ? onFinishEditing : onAddItem}
				showShadow
				size="lg"
				systemImage="plus"
				testID="home-add-item-button"
			/>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	position: (bottomOffset: number) => ({
		position: "absolute",
		right: theme.spacing(5),
		bottom: bottomOffset,
		zIndex: 60,
	}),
}));
