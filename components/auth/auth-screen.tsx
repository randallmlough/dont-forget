import type { ReactNode } from "react";
import { KeyboardAvoidingView, ScrollView, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const KAV_BEHAVIOR = "padding" as const;

export function AuthScreen({
	title,
	subtitle,
	children,
}: {
	title: string;
	subtitle?: string;
	children: ReactNode;
}) {
	return (
		<KeyboardAvoidingView style={styles.flex} behavior={KAV_BEHAVIOR}>
			<ScrollView
				contentContainerStyle={styles.container}
				keyboardShouldPersistTaps="handled"
			>
				<Text style={styles.title}>{title}</Text>
				{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
				{children}
			</ScrollView>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create((theme) => ({
	flex: { flex: 1, backgroundColor: theme.colors.authBackground },
	container: {
		flexGrow: 1,
		justifyContent: "center",
		paddingHorizontal: theme.spacing(8),
		paddingVertical: theme.spacing(12),
		gap: theme.spacing(3),
	},
	title: {
		...theme.typography.title,
		color: theme.colors.textStrong,
		textAlign: "center",
	},
	subtitle: {
		...theme.typography.callout,
		color: theme.colors.textMuted,
		textAlign: "center",
		marginBottom: theme.spacing(4),
	},
}));
