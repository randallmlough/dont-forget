import { DefaultTheme, type Theme } from "expo-router/react-navigation";

import type { AppTheme } from "@/client/theme/theme-contract";

export function navigationThemeFor(theme: AppTheme, dark: boolean): Theme {
	return {
		...DefaultTheme,
		dark,
		colors: {
			...DefaultTheme.colors,
			background: theme.colors.background,
			border: theme.colors.border,
			card: theme.colors.surface,
			notification: theme.colors.destructive,
			primary: theme.colors.primary,
			text: theme.colors.text,
		},
	};
}
