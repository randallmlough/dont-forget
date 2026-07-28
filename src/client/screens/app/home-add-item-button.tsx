import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { ButtonIconGlass } from "@/client/ui/button-icon-glass";

export type HomeAddItemButtonProps = {
	onPress: () => void;
};

export function HomeAddItemButton({ onPress }: HomeAddItemButtonProps) {
	const insets = useSafeAreaInsets();

	return (
		<View
			pointerEvents="box-none"
			style={styles.position(insets.bottom)}
			testID="home-add-item-button-position"
		>
			<ButtonIconGlass
				accessibilityHint="Starts adding Items to the Current List"
				accessibilityLabel="Add Item"
				onPress={onPress}
				showShadow
				size="lg"
				systemImage="plus"
				testID="home-add-item-button"
			/>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	position: (bottomInset: number) => ({
		position: "absolute",
		right: theme.spacing(5),
		bottom: bottomInset + theme.spacing(16),
		zIndex: 60,
	}),
}));
