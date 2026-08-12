import { Button } from "@mobile/ui/button";
import { GlassSurface } from "@mobile/ui/glass-surface";
import { SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useNavigationDrawer } from "./navigation-drawer-context";

export type ScreenScaffoldNavigation =
	| { kind: "drawer" }
	| { kind: "back"; onPress: () => void };

export type ScreenScaffoldProps = {
	label: string;
	title: string;
	children: ReactNode;
	navigation?: ScreenScaffoldNavigation;
};

export function ScreenScaffold({
	label,
	title,
	children,
	navigation = { kind: "drawer" },
}: ScreenScaffoldProps) {
	const { open } = useNavigationDrawer();
	const { theme } = useUnistyles();
	const isBackNavigation = navigation.kind === "back";
	const navigationLabel = isBackNavigation ? "Go back" : "Open navigation";
	const onNavigate = isBackNavigation ? navigation.onPress : open;

	return (
		<View style={styles.root}>
			<SafeAreaView edges={["top"]} style={styles.headerSafeArea}>
				<View style={styles.header}>
					<Button
						accessibilityLabel={navigationLabel}
						onPress={onNavigate}
						size="icon"
						style={styles.menuButton}
						variant="link"
					>
						<GlassSurface interactive style={styles.navigationGlass}>
							<SymbolView
								accessibilityElementsHidden
								accessible={false}
								name={isBackNavigation ? "chevron.left" : "line.3.horizontal"}
								size={20}
								tintColor={theme.colors.foreground}
								weight="medium"
							/>
						</GlassSurface>
					</Button>
					<View style={styles.headerTextGroup}>
						<Text style={styles.headerLabel}>{label}</Text>
						<Text numberOfLines={2} style={styles.headerTitle}>
							{title}
						</Text>
					</View>
				</View>
			</SafeAreaView>
			<SafeAreaView edges={["bottom"]} style={styles.contentSafeArea}>
				{children}
			</SafeAreaView>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	headerSafeArea: {
		backgroundColor: theme.colors.background,
	},
	contentSafeArea: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	header: {
		gap: theme.spacing(2),
		paddingHorizontal: theme.spacing(5),
		paddingTop: theme.spacing(3),
		paddingBottom: theme.spacing(4),
		backgroundColor: theme.colors.background,
	},
	menuButton: {
		width: theme.spacing(11),
		height: theme.spacing(11),
		marginLeft: -theme.spacing(1),
		borderRadius: theme.radii.full,
	},
	navigationGlass: {
		width: theme.spacing(11),
		height: theme.spacing(11),
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.radii.full,
	},
	headerTextGroup: {
		alignSelf: "stretch",
		minWidth: 0,
	},
	headerLabel: {
		...theme.typography.overline,
		color: theme.colors.destructive,
		textTransform: "uppercase",
	},
	headerTitle: {
		...theme.typography.largeTitle,
		color: theme.colors.foreground,
	},
}));
