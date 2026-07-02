import { ActivityIndicator, Pressable, Text } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function PrimaryButton({
	label,
	onPress,
	loading = false,
}: {
	label: string;
	onPress: () => void;
	loading?: boolean;
}) {
	const { theme } = useUnistyles();

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ disabled: loading, busy: loading }}
			onPress={onPress}
			disabled={loading}
			style={({ pressed }) => [
				styles.button,
				(pressed || loading) && styles.pressed,
			]}
		>
			{loading ? (
				<ActivityIndicator color={theme.colors.inverseText} />
			) : (
				<Text style={styles.label}>{label}</Text>
			)}
		</Pressable>
	);
}

const styles = StyleSheet.create((theme) => ({
	button: {
		height: theme.spacing(13),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		backgroundColor: theme.colors.authPrimary,
		alignItems: "center",
		justifyContent: "center",
	},
	pressed: {
		opacity: theme.opacities.disabled,
	},
	label: {
		color: theme.colors.inverseText,
		fontSize: theme.fontSizes.subheadline,
		fontWeight: theme.fontWeights.semibold,
	},
}));
