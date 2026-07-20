import { TextInput, type TextInputProps } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function AuthTextInput(props: TextInputProps) {
	const { theme } = useUnistyles();

	return (
		<TextInput
			placeholderTextColor={theme.colors.subtleForeground}
			autoCapitalize="none"
			{...props}
			style={[styles.input, props.style]}
		/>
	);
}

const styles = StyleSheet.create((theme) => ({
	input: {
		height: theme.spacing(12),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		paddingHorizontal: theme.spacing(3.5),
		fontSize: theme.fontSizes.body,
		backgroundColor: theme.colors.card,
		color: theme.colors.foreground,
	},
}));
