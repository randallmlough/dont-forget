import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import type { ReactNode } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { nativeColorScheme } from "@mobile/theme/native-color-scheme";

const canRenderNativeGlass = isGlassEffectAPIAvailable();

export type GlassSurfaceProps = {
	children: ReactNode;
	interactive?: boolean;
	style?: StyleProp<ViewStyle>;
	testID?: string;
	tone?: "default" | "selected";
};

export function GlassSurface({
	children,
	interactive = false,
	style,
	testID,
	tone = "default",
}: GlassSurfaceProps) {
	const { rt, theme } = useUnistyles();
	const colorScheme = nativeColorScheme(rt.themeName);
	const toneStyle =
		tone === "selected" ? styles.selectedSurface : styles.defaultSurface;

	if (!canRenderNativeGlass) {
		return (
			<View testID={testID} style={[styles.surface, toneStyle, style]}>
				{children}
			</View>
		);
	}

	return (
		<GlassView
			colorScheme={colorScheme}
			glassEffectStyle="regular"
			isInteractive={interactive}
			testID={testID}
			tintColor={
				tone === "selected"
					? theme.colors.glassTintSelected
					: theme.colors.glassTint
			}
			style={[styles.surface, toneStyle, style]}
		>
			{children}
		</GlassView>
	);
}

const styles = StyleSheet.create((theme) => ({
	surface: {
		overflow: "hidden",
		borderWidth: theme.borders.hairline,
	},
	defaultSurface: {
		backgroundColor: theme.colors.glassTint,
		borderColor: theme.colors.glassBorder,
	},
	selectedSurface: {
		backgroundColor: theme.colors.glassTintSelected,
		borderColor: theme.colors.primary,
	},
}));
