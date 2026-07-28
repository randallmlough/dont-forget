import { KeyboardAvoidingView, View } from "react-native";
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
	const restingBottomOffset = insets.bottom + theme.spacing(16);
	const keyboardGap = theme.spacing(2);

	return (
		<KeyboardAvoidingView
			behavior="height"
			keyboardVerticalOffset={keyboardGap - restingBottomOffset}
			pointerEvents="box-none"
			style={styles.keyboardLayer}
			testID="home-add-item-button-keyboard-layer"
		>
			<View
				pointerEvents="box-none"
				style={styles.position(restingBottomOffset)}
				testID="home-add-item-button-position"
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
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create((theme) => ({
	keyboardLayer: {
		position: "absolute",
		top: 0,
		right: 0,
		left: 0,
		height: "100%",
		zIndex: 60,
	},
	position: (bottomOffset: number) => ({
		position: "absolute",
		right: theme.spacing(5),
		bottom: bottomOffset,
	}),
}));
