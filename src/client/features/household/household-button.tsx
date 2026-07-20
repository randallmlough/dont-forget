import { Pressable, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function HouseholdButton({
	label,
	onPress,
	disabled,
	accessibilityHint,
	accessibilityLabel,
	variant = "secondary",
}: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	accessibilityHint?: string;
	accessibilityLabel?: string;
	variant?: "primary" | "secondary" | "danger";
}) {
	return (
		<Pressable
			accessibilityHint={accessibilityHint}
			accessibilityLabel={accessibilityLabel}
			accessibilityRole="button"
			accessibilityState={{ disabled: Boolean(disabled) }}
			disabled={disabled}
			onPress={onPress}
			style={({ pressed }) => [
				styles.base,
				variant === "primary" ? styles.primary : undefined,
				variant === "secondary" ? styles.secondary : undefined,
				variant === "danger" ? styles.danger : undefined,
				pressed ? styles.pressed : undefined,
				disabled ? styles.disabled : undefined,
			]}
		>
			<Text
				style={[
					styles.label,
					variant === "secondary" ? styles.secondaryLabel : undefined,
					variant === "primary" ? styles.primaryLabel : undefined,
					variant === "danger" ? styles.dangerLabel : undefined,
				]}
			>
				{label}
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create((theme) => ({
	base: {
		minHeight: theme.spacing(11),
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: theme.spacing(3),
		borderRadius: theme.radii.control,
	},
	primary: {
		paddingHorizontal: theme.spacing(4),
		backgroundColor: theme.colors.primary,
	},
	secondary: {
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		backgroundColor: theme.colors.card,
	},
	danger: {
		backgroundColor: theme.colors.destructive,
	},
	label: {
		...theme.typography.callout,
		fontWeight: theme.fontWeights.semibold,
	},
	secondaryLabel: {
		color: theme.colors.foreground,
	},
	primaryLabel: {
		color: theme.colors.primaryForeground,
	},
	dangerLabel: {
		color: theme.colors.destructiveForeground,
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
	disabled: {
		opacity: theme.opacities.disabled,
	},
}));
