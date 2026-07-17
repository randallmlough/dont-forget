import { SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useNavigationDrawer } from "./navigation-drawer-context";

export type ScreenScaffoldProps = {
	label: string;
	title: string;
	children: ReactNode;
};

export function ScreenScaffold({
	label,
	title,
	children,
}: ScreenScaffoldProps) {
	const { open } = useNavigationDrawer();
	const { theme } = useUnistyles();

	return (
		<SafeAreaView edges={["top", "bottom"]} style={styles.root}>
			<View style={styles.header}>
				<Pressable
					accessibilityLabel="Open navigation"
					accessibilityRole="button"
					onPress={open}
					style={({ pressed }) => [
						styles.menuButton,
						pressed ? styles.pressed : undefined,
					]}
				>
					<SymbolView
						accessibilityElementsHidden
						accessible={false}
						name="line.3.horizontal"
						size={22}
						tintColor={theme.colors.text}
						weight="medium"
					/>
				</Pressable>
				<View style={styles.headerTextGroup}>
					<Text style={styles.headerLabel}>{label}</Text>
					<Text numberOfLines={1} style={styles.headerTitle}>
						{title}
					</Text>
				</View>
			</View>
			{children}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(5),
		paddingTop: theme.spacing(4.5),
		paddingBottom: theme.spacing(3),
		backgroundColor: theme.colors.surface,
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	menuButton: {
		width: theme.spacing(11),
		height: theme.spacing(11),
		marginLeft: -theme.spacing(2.5),
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.radii.pill,
	},
	headerTextGroup: {
		flex: 1,
		minWidth: 0,
	},
	headerLabel: {
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
	},
	headerTitle: {
		...theme.typography.headline,
		color: theme.colors.text,
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
}));
