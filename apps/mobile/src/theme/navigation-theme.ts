import type { AppTheme } from "@mobile/theme/theme-contract";
import { DefaultTheme, type Theme } from "expo-router/react-navigation";

export function navigationThemeFor(theme: AppTheme, dark: boolean): Theme {
	return {
		...DefaultTheme,
		dark,
		colors: {
			...DefaultTheme.colors,
			background: theme.colors.background,
			border: theme.colors.border,
			card: theme.colors.card,
			notification: theme.colors.destructive,
			primary: theme.colors.primary,
			text: theme.colors.foreground,
		},
	};
}
