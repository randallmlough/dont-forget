import { StyleSheet } from "react-native-unistyles";

export const lightTheme = {
  colors: {
    background: "#F8FAFC",
    authBackground: "#FFFFFF",
    surface: "#FFFFFF",
    text: "#102A43",
    textStrong: "#1F1F1F",
    textMuted: "#627D98",
    textSubtle: "#829AB1",
    border: "#D9E2EC",
    inputBorder: "#BCCCDC",
    authBorder: "#DADCE0",
    divider: "#C0C0C0",
    primary: "#2F855A",
    primaryDisabled: "#9FB3C8",
    destructive: "#E53E3E",
    link: "#1A73E8",
    authPrimary: "#1F1F1F",
    inverseText: "#FFFFFF",
  },
  radii: {
    card: 8,
    control: 8,
  },
  spacing: (step: number) => step * 4,
};

const appThemes = {
  light: lightTheme,
};

const breakpoints = {
  compact: 0,
  regular: 768,
};

type AppThemes = typeof appThemes;
type AppBreakpoints = typeof breakpoints;

declare module "react-native-unistyles" {
  export interface UnistylesThemes extends AppThemes {}
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

StyleSheet.configure({
  themes: appThemes,
  breakpoints,
  settings: {
    initialTheme: "light",
  },
});
