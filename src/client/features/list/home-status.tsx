import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function HomeStatus({
	title,
	body,
	children,
}: {
	title: string;
	body: string;
	children?: ReactNode;
}) {
	return (
		<View style={styles.statusRoot}>
			<View style={styles.statusCard}>
				<Text style={styles.statusTitle}>{title}</Text>
				<Text style={styles.statusBody}>{body}</Text>
				{children}
			</View>
		</View>
	);
}

export function HomeRetryButton({ onPress }: { onPress: () => void }) {
	return (
		<Pressable
			accessibilityRole="button"
			onPress={onPress}
			style={({ pressed }) => [
				styles.retryButton,
				pressed ? styles.retryButtonPressed : undefined,
			]}
		>
			<Text style={styles.retryButtonLabel}>Try again</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create((theme) => ({
	statusRoot: {
		flex: 1,
		justifyContent: "center",
		padding: theme.spacing(5),
		backgroundColor: theme.colors.background,
	},
	statusCard: {
		alignItems: "center",
		gap: theme.spacing(3),
		padding: theme.spacing(7),
		borderRadius: theme.radii["2xl"],
		borderCurve: "continuous",
		backgroundColor: theme.colors.card,
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.border,
	},
	statusTitle: {
		...theme.typography.headline,
		color: theme.colors.foreground,
		textAlign: "center",
	},
	statusBody: {
		...theme.typography.callout,
		color: theme.colors.mutedForeground,
		textAlign: "center",
	},
	retryButton: {
		minHeight: theme.spacing(11),
		paddingHorizontal: theme.spacing(4),
		borderRadius: theme.radii.xl,
		borderCurve: "continuous",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.primary,
	},
	retryButtonPressed: {
		opacity: theme.opacities.pressed,
	},
	retryButtonLabel: {
		...theme.typography.callout,
		color: theme.colors.primaryForeground,
		fontWeight: theme.fontWeights.bold,
	},
}));
