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
	title: 28,
	largeTitle: 30,
} as const;

const fontWeights = {
	medium: "500",
	semibold: "600",
	bold: "700",
} as const;

const radii = {
	card: 8,
	control: 8,
	checkbox: 6,
	checkboxMark: 5,
} as const;

const typography = {
	largeTitle: {
		fontSize: fontSizes.largeTitle,
		fontWeight: fontWeights.bold,
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
	thick: 2,
} as const;

const spacing = (step: number) => step * 4;

export const lightTheme = {
	colors: {
		background: brandPalette.slate50,
		authBackground: brandPalette.white,
		surface: brandPalette.white,
		text: brandPalette.navy900,
		textStrong: brandPalette.neutral950,
		textMuted: brandPalette.slate600,
		textSubtle: brandPalette.slate500,
		border: brandPalette.slate200,
		inputBorder: brandPalette.slate300,
		authBorder: brandPalette.gray200,
		divider: brandPalette.gray300,
		primary: brandPalette.green700,
		primaryDisabled: brandPalette.slate400,
		destructive: brandPalette.red500,
		link: brandPalette.blue600,
		authPrimary: brandPalette.neutral950,
		inverseText: brandPalette.white,
	},
	effects: {
		addItemComposer: {
			entryBackground: withAlpha(brandPalette.white, 0.86),
			entryBorder: withAlpha(brandPalette.slate500, 0.38),
			trayBackground: withAlpha(brandPalette.white, 0.78),
			trayBorder: withAlpha(brandPalette.slate500, 0.4),
			inputBackground: withAlpha(brandPalette.white, 0.74),
			inputBorder: withAlpha(brandPalette.slate500, 0.36),
			fieldBackground: withAlpha(brandPalette.white, 0.58),
			pillBackground: withAlpha(brandPalette.white, 0.62),
			pillBorder: withAlpha(brandPalette.slate500, 0.34),
			selectedPillBackground: withAlpha(brandPalette.green700, 0.12),
			selectedPillBorder: withAlpha(brandPalette.green700, 0.28),
			entryShadow: shadow(0, 6, 18, withAlpha(brandPalette.navy900, 0.12)),
			trayShadow: shadow(0, 8, 28, withAlpha(brandPalette.navy900, 0.18)),
		},
	},
	radii,
	fontSizes,
	fontWeights,
	typography,
	opacities,
	borders,
	spacing,
} satisfies AppTheme;

export const darkTheme = {
	colors: {
		background: brandPalette.navy950,
		authBackground: brandPalette.navy950,
		surface: brandPalette.navy900,
		text: brandPalette.slate50,
		textStrong: brandPalette.white,
		textMuted: brandPalette.slate300,
		textSubtle: brandPalette.slate400,
		border: brandPalette.slate700,
		inputBorder: brandPalette.slate600,
		authBorder: brandPalette.slate700,
		divider: brandPalette.slate700,
		primary: brandPalette.green300,
		primaryDisabled: brandPalette.slate600,
		destructive: brandPalette.red400,
		link: brandPalette.blue300,
		authPrimary: brandPalette.slate50,
		inverseText: brandPalette.navy950,
	},
	effects: {
		addItemComposer: {
			entryBackground: withAlpha(brandPalette.navy900, 0.86),
			entryBorder: withAlpha(brandPalette.slate600, 0.42),
			trayBackground: withAlpha(brandPalette.navy900, 0.82),
			trayBorder: withAlpha(brandPalette.slate600, 0.46),
			inputBackground: withAlpha(brandPalette.navy950, 0.72),
			inputBorder: withAlpha(brandPalette.slate600, 0.42),
			fieldBackground: withAlpha(brandPalette.navy950, 0.58),
			pillBackground: withAlpha(brandPalette.navy950, 0.62),
			pillBorder: withAlpha(brandPalette.slate600, 0.38),
			selectedPillBackground: withAlpha(brandPalette.green300, 0.16),
			selectedPillBorder: withAlpha(brandPalette.green300, 0.34),
			entryShadow: shadow(0, 6, 18, withAlpha(brandPalette.navy950, 0.32)),
			trayShadow: shadow(0, 8, 28, withAlpha(brandPalette.navy950, 0.38)),
		},
	},
	radii,
	fontSizes,
	fontWeights,
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

function shadow(x: number, y: number, blur: number, color: string): string {
	return `${x} ${y}px ${blur}px ${color}`;
}
