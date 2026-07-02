import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function OrDivider() {
	return (
		<View style={styles.row}>
			<View style={styles.line} />
			<Text style={styles.text}>or</Text>
			<View style={styles.line} />
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		marginVertical: theme.spacing(2),
	},
	line: {
		flex: 1,
		height: theme.borders.hairline,
		backgroundColor: theme.colors.divider,
	},
	text: {
		...theme.typography.caption,
		color: theme.colors.textSubtle,
	},
}));
