import { StyleSheet } from "react-native-unistyles";

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
		checkbox: 6,
		checkboxMark: 5,
	},
	fontSizes,
	fontWeights,
	typography: {
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
	},
	opacities: {
		pressed: 0.72,
		disabled: 0.7,
	},
	borders: {
		hairline: StyleSheet.hairlineWidth,
		thin: 1,
		thick: 2,
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
