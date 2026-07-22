import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { ScopedTheme, StyleSheet } from "react-native-unistyles";

export type FormStoryTheme = "light" | "dark";

export function FormStoryCanvas({
	children,
	themeName,
}: {
	children: ReactNode;
	themeName: FormStoryTheme;
}) {
	return (
		<ScopedTheme name={themeName}>
			<ScrollView contentContainerStyle={styles.canvas} style={styles.screen}>
				<View style={styles.content}>{children}</View>
			</ScrollView>
		</ScopedTheme>
	);
}

export function FormStorySection({
	children,
	description,
	title,
}: {
	children: ReactNode;
	description?: string;
	title: string;
}) {
	return (
		<View style={styles.section}>
			<View style={styles.heading}>
				<Text style={styles.title}>{title}</Text>
				{description ? (
					<Text style={styles.description}>{description}</Text>
				) : null}
			</View>
			<View style={styles.examples}>{children}</View>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	screen: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	canvas: {
		padding: theme.spacing(6),
	},
	content: {
		width: "100%",
		maxWidth: theme.spacing(150),
		alignSelf: "center",
		gap: theme.spacing(8),
	},
	section: {
		gap: theme.spacing(3),
	},
	heading: {
		gap: theme.spacing(1),
	},
	title: {
		color: theme.colors.foreground,
		...theme.typography.headline,
	},
	description: {
		color: theme.colors.mutedForeground,
		...theme.typography.callout,
	},
	examples: {
		gap: theme.spacing(4),
	},
}));
