import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { Button } from "./button";

export type ScreenSectionProps = {
	action?: {
		label: string;
		onPress: () => void;
	};
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
				{action ? (
					<Button
						onPress={action.onPress}
						style={styles.action}
						textStyle={styles.actionLabel}
						variant="ghost"
					>
						{action.label}
					</Button>
				) : null}
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
	action: {
		minHeight: theme.spacing(11),
		justifyContent: "center",
		paddingHorizontal: theme.spacing(2),
		marginVertical: -theme.spacing(2),
	},
	actionLabel: {
		...theme.typography.callout,
		color: theme.colors.primary,
	},
}));
