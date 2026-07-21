import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/client/ui/button";

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
	return <Button onPress={onPress}>Try again</Button>;
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
}));
