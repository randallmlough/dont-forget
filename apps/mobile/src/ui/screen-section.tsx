import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export type ScreenSectionProps = {
	action?: ReactNode;
	children?: ReactNode;
	detail?: string;
	title: string;
};

export function ScreenSection({
	action,
	children,
	detail,
	title,
}: ScreenSectionProps) {
	return (
		<View style={styles.section}>
			<View style={styles.heading}>
				<Text style={styles.title}>{title}</Text>
				{detail ? <Text style={styles.detail}>{detail}</Text> : null}
				{action}
			</View>
			{children}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	section: {
		gap: theme.spacing(2),
	},
	heading: {
		minHeight: theme.spacing(7),
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: theme.spacing(1),
	},
	title: {
		...theme.typography.overline,
		color: theme.colors.mutedForeground,
		textTransform: "uppercase",
	},
	detail: {
		...theme.typography.caption,
		color: theme.colors.mutedForeground,
	},
}));
