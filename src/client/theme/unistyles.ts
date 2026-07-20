import { StyleSheet } from "react-native-unistyles";

import { brandPalette } from "./palette";
import type { AppTheme } from "./theme-contract";

const fontSizes = {
	xs: 12,
	sm: 14,
	base: 16,
	lg: 18,
	xl: 20,
	"2xl": 24,
	"3xl": 30,
	"5xl": 44,
} as const;

const lineHeights = {
	xs: 16,
	sm: 20,
	base: 24,
	lg: 26,
	xl: 28,
	"2xl": 32,
	"3xl": 38,
	"5xl": 50,
} as const;

const fontWeights = {
	medium: "500",
	semibold: "600",
	bold: "700",
} as const;

const fontFamilies = {
	serif: "Georgia",
} as const;

const radii = {
	sm: 6,
	md: 8,
	lg: 12,
	xl: 16,
	"2xl": 24,
	full: 999,
} as const;

const typography = {
	largeTitle: {
		fontSize: fontSizes["5xl"],
		fontFamily: fontFamilies.serif,
		lineHeight: lineHeights["5xl"],
	},
	title: {
		fontSize: fontSizes["3xl"],
		fontWeight: fontWeights.bold,
		lineHeight: lineHeights["3xl"],
	},
	headline: {
		fontSize: fontSizes.xl,
		fontWeight: fontWeights.bold,
		lineHeight: lineHeights.xl,
	},
	body: {
		fontSize: fontSizes.base,
		lineHeight: lineHeights.base,
	},
	callout: {
		fontSize: fontSizes.sm,
		lineHeight: lineHeights.sm,
	},
	caption: {
		fontSize: fontSizes.xs,
		lineHeight: lineHeights.xs,
	},
	captionStrong: {
		fontSize: fontSizes.xs,
		fontWeight: fontWeights.semibold,
		lineHeight: lineHeights.xs,
	},
	overline: {
		fontSize: fontSizes.xs,
		fontWeight: fontWeights.semibold,
		letterSpacing: 1.5,
		lineHeight: lineHeights.xs,
	},
	controlLabel: {
		fontSize: fontSizes.base,
		fontWeight: fontWeights.bold,
		lineHeight: lineHeights.base,
	},
} as const;

const opacities = {
	pressed: 0.72,
	disabled: 0.7,
} as const;

const borders = {
	hairline: StyleSheet.hairlineWidth,
	thin: 1,
} as const;

const spacing = (step: number) => step * 4;

export const lightTheme = {
	colors: {
		background: brandPalette.cream50,
		foreground: brandPalette.ink950,
		card: brandPalette.white,
		cardForeground: brandPalette.ink950,
		primary: brandPalette.moss900,
		primaryForeground: brandPalette.white,
		secondary: brandPalette.cream100,
		secondaryForeground: brandPalette.ink950,
		muted: brandPalette.cream100,
		mutedForeground: brandPalette.ink600,
		subtleForeground: brandPalette.ink500,
		destructive: brandPalette.red600,
		destructiveForeground: brandPalette.white,
		border: brandPalette.cream200,
		input: brandPalette.cream300,
		link: brandPalette.blue700,
		scrim: withAlpha(brandPalette.charcoal950, 0.46),
		glassTint: withAlpha(brandPalette.white, 0.64),
		glassTintSelected: withAlpha(brandPalette.moss700, 0.22),
		glassBorder: withAlpha(brandPalette.white, 0.82),
		appearanceLightBackground: brandPalette.cream50,
		appearanceLightSurface: brandPalette.white,
		appearanceDarkBackground: brandPalette.charcoal950,
		appearanceDarkSurface: brandPalette.charcoal800,
	},
	radii,
	fontSizes,
	lineHeights,
	fontWeights,
	fontFamilies,
	typography,
	opacities,
	borders,
	spacing,
} satisfies AppTheme;

export const darkTheme = {
	colors: {
		background: brandPalette.charcoal950,
		foreground: brandPalette.cream50,
		card: brandPalette.charcoal900,
		cardForeground: brandPalette.cream50,
		primary: brandPalette.moss300,
		primaryForeground: brandPalette.charcoal950,
		secondary: brandPalette.charcoal800,
		secondaryForeground: brandPalette.cream50,
		muted: brandPalette.charcoal800,
		mutedForeground: brandPalette.warmGray300,
		subtleForeground: brandPalette.warmGray400,
		destructive: brandPalette.red300,
		destructiveForeground: brandPalette.charcoal950,
		border: brandPalette.charcoal700,
		input: brandPalette.charcoal700,
		link: brandPalette.blue300,
		scrim: withAlpha(brandPalette.charcoal950, 0.72),
		glassTint: withAlpha(brandPalette.charcoal800, 0.7),
		glassTintSelected: withAlpha(brandPalette.moss700, 0.38),
		glassBorder: withAlpha(brandPalette.warmGray300, 0.24),
		appearanceLightBackground: brandPalette.cream50,
		appearanceLightSurface: brandPalette.white,
		appearanceDarkBackground: brandPalette.charcoal950,
		appearanceDarkSurface: brandPalette.charcoal800,
	},
	radii,
	fontSizes,
	lineHeights,
	fontWeights,
	fontFamilies,
	typography,
	opacities,
	borders,
	spacing,
} satisfies AppTheme;

type AppThemes = {
	light: AppTheme;
	dark: AppTheme;
};

const appThemes: AppThemes = {
	light: lightTheme,
	dark: darkTheme,
};

const breakpoints = {
	compact: 0,
	regular: 768,
};

type AppBreakpoints = typeof breakpoints;

declare module "react-native-unistyles" {
	export interface UnistylesThemes {
		light: AppTheme;
		dark: AppTheme;
	}
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	export interface UnistylesBreakpoints extends AppBreakpoints {}
}

StyleSheet.configure({
	themes: appThemes,
	breakpoints,
	settings: {
		initialTheme: "light",
	},
});

function withAlpha(color: string, alpha: number): string {
	const red = Number.parseInt(color.slice(1, 3), 16);
	const green = Number.parseInt(color.slice(3, 5), 16);
	const blue = Number.parseInt(color.slice(5, 7), 16);

	return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
