import { SymbolView } from "expo-symbols";
import { Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { GlassSurface } from "./glass-surface";

export type ActionMenuButtonProps = {
	accessibilityLabel: string;
	disabled?: boolean;
	onPress: () => void;
};

export function ActionMenuButton({
	accessibilityLabel,
	disabled = false,
	onPress,
}: ActionMenuButtonProps) {
	const { theme } = useUnistyles();

	return (
		<Pressable
			accessibilityLabel={accessibilityLabel}
			accessibilityRole="button"
			accessibilityState={{ disabled }}
			disabled={disabled}
			onPress={onPress}
			style={({ pressed }) => [
				styles.pressable,
				pressed ? styles.pressed : undefined,
				disabled ? styles.disabled : undefined,
			]}
		>
			<GlassSurface interactive style={styles.surface}>
				<SymbolView
					accessibilityElementsHidden
					accessible={false}
					name="ellipsis"
					size={17}
					tintColor={theme.colors.text}
					weight="medium"
				/>
			</GlassSurface>
		</Pressable>
	);
}

const styles = StyleSheet.create((theme) => ({
	pressable: {
		width: theme.spacing(11),
		height: theme.spacing(11),
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.radii.pill,
	},
	surface: {
		width: theme.spacing(8),
		height: theme.spacing(8),
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.radii.pill,
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
	disabled: {
		opacity: theme.opacities.disabled,
	},
}));
