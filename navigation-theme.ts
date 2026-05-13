import { DefaultTheme, type Theme } from "@react-navigation/native";

import { lightTheme } from "@/unistyles";

export const navigationTheme: Theme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    background: lightTheme.colors.background,
    border: lightTheme.colors.border,
    card: lightTheme.colors.surface,
    notification: lightTheme.colors.destructive,
    primary: lightTheme.colors.primary,
    text: lightTheme.colors.text,
  },
};
