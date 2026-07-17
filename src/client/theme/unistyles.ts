import { StyleSheet } from "react-native-unistyles";

import { brandPalette } from "./palette";
import type { AppTheme } from "./theme-contract";

const fontSizes = {
	caption: 13,
	footnote: 14,
	callout: 15,
	body: 16,
	subheadline: 17,
	titleSmall: 18,
	headline: 20,
	title: 30,
	largeTitle: 44,
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
	card: 22,
	control: 14,
	pill: 999,
	checkbox: 12,
} as const;

const typography = {
	largeTitle: {
		fontSize: fontSizes.largeTitle,
		fontFamily: fontFamilies.serif,
		lineHeight: 50,
	},
	title: {
		fontSize: fontSizes.title,
		fontWeight: fontWeights.bold,
	},
	headline: {
		fontSize: fontSizes.headline,
		fontWeight: fontWeights.bold,
	},
	body: {
		fontSize: fontSizes.body,
	},
	callout: {
		fontSize: fontSizes.callout,
	},
	caption: {
		fontSize: fontSizes.caption,
	},
	captionStrong: {
		fontSize: fontSizes.caption,
		fontWeight: fontWeights.semibold,
	},
	overline: {
		fontSize: fontSizes.caption,
		fontWeight: fontWeights.semibold,
		letterSpacing: 1.5,
	},
	controlLabel: {
		fontSize: fontSizes.body,
		fontWeight: fontWeights.bold,
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
		authBackground: brandPalette.white,
		surface: brandPalette.white,
		text: brandPalette.ink950,
		textStrong: brandPalette.ink950,
		textMuted: brandPalette.ink600,
		textSubtle: brandPalette.ink500,
		border: brandPalette.cream200,
		inputBorder: brandPalette.cream300,
		authBorder: brandPalette.cream200,
		divider: brandPalette.cream200,
		primary: brandPalette.moss900,
		primaryDisabled: brandPalette.cream300,
		destructive: brandPalette.red600,
		link: brandPalette.blue700,
		authPrimary: brandPalette.ink950,
		inverseText: brandPalette.white,
		scrim: withAlpha(brandPalette.charcoal950, 0.46),
	},
	radii,
	fontSizes,
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
		authBackground: brandPalette.charcoal950,
		surface: brandPalette.charcoal900,
		text: brandPalette.cream50,
		textStrong: brandPalette.white,
		textMuted: brandPalette.warmGray300,
		textSubtle: brandPalette.warmGray400,
		border: brandPalette.charcoal700,
		inputBorder: brandPalette.charcoal700,
		authBorder: brandPalette.charcoal700,
		divider: brandPalette.charcoal700,
		primary: brandPalette.moss300,
		primaryDisabled: brandPalette.charcoal700,
		destructive: brandPalette.red300,
		link: brandPalette.blue300,
		authPrimary: brandPalette.cream50,
		inverseText: brandPalette.charcoal950,
		scrim: withAlpha(brandPalette.charcoal950, 0.72),
	},
	radii,
	fontSizes,
	fontWeights,
	fontFamilies,
	typography,
	opacities,
	borders,
	spacing,
} satisfies AppTheme;

const appThemes = {
	light: lightTheme,
	dark: darkTheme,
};

const breakpoints = {
	compact: 0,
	regular: 768,
};

type AppThemes = typeof appThemes;
type AppBreakpoints = typeof breakpoints;

declare module "react-native-unistyles" {
	// Module augmentation requires empty extension interfaces for Unistyles.
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	export interface UnistylesThemes extends AppThemes {}
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
