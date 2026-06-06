import { Pressable, Text } from "react-native";
import { styles } from "./list-switcher-styles";

export function ListSwitcherSegmentButton({
	active,
	label,
	onPress,
}: {
	active: boolean;
	label: string;
	onPress: () => void;
}) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ selected: active }}
			onPress={onPress}
			style={({ pressed }) => [
				styles.segmentButton,
				active ? styles.segmentButtonActive : undefined,
				pressed ? styles.pressed : undefined,
			]}
		>
			<Text
				style={[
					styles.segmentButtonLabel,
					active ? styles.segmentButtonLabelActive : undefined,
				]}
			>
				{label}
			</Text>
		</Pressable>
	);
}
