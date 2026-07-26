import type { ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/client/ui/card";

export function StatusCard({
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
			<Card style={styles.statusCard}>
				<CardHeader style={styles.statusHeader}>
					<CardTitle style={styles.statusTitle}>{title}</CardTitle>
					<CardDescription style={styles.statusBody}>{body}</CardDescription>
				</CardHeader>
				{children ? (
					<CardContent style={styles.statusContent}>{children}</CardContent>
				) : null}
			</Card>
		</View>
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
	},
	statusHeader: {
		alignItems: "center",
		gap: theme.spacing(3),
		padding: 0,
		paddingBottom: 0,
	},
	statusContent: {
		alignItems: "center",
		padding: 0,
		paddingTop: 0,
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
