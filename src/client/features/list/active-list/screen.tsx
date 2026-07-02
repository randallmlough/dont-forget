import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function ActiveListScreen({ children }: PropsWithChildren) {
	return <View style={styles.screen}>{children}</View>;
}

const styles = StyleSheet.create((theme) => ({
	screen: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));
