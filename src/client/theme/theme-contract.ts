import type { TextStyle } from "react-native";

type FontWeight = NonNullable<TextStyle["fontWeight"]>;

type TypographyStyle = {
	fontSize: number;
	fontFamily?: string;
	fontWeight?: FontWeight;
	letterSpacing?: number;
	lineHeight?: number;
};

export type AppTheme = {
	colors: {
		background: string;
		foreground: string;
		card: string;
		cardForeground: string;
		primary: string;
		primaryForeground: string;
		secondary: string;
		secondaryForeground: string;
		muted: string;
		mutedForeground: string;
		subtleForeground: string;
		destructive: string;
		destructiveForeground: string;
		border: string;
		input: string;
		link: string;
		scrim: string;
		glassTint: string;
		glassTintSelected: string;
		glassBorder: string;
		appearanceLightBackground: string;
		appearanceLightSurface: string;
		appearanceDarkBackground: string;
		appearanceDarkSurface: string;
	};
	radii: {
		card: number;
		control: number;
		pill: number;
		checkbox: number;
	};
	fontSizes: {
		caption: number;
		footnote: number;
		callout: number;
		body: number;
		subheadline: number;
		titleSmall: number;
		headline: number;
		title: number;
		largeTitle: number;
	};
	fontWeights: {
		medium: FontWeight;
		semibold: FontWeight;
		bold: FontWeight;
	};
	fontFamilies: {
		serif: string;
	};
	typography: {
		largeTitle: TypographyStyle;
		title: TypographyStyle;
		headline: TypographyStyle;
		body: TypographyStyle;
		callout: TypographyStyle;
		caption: TypographyStyle;
		captionStrong: TypographyStyle;
		overline: TypographyStyle;
		controlLabel: TypographyStyle;
	};
	opacities: {
		pressed: number;
		disabled: number;
	};
	borders: {
		hairline: number;
		thin: number;
	};
	spacing: (step: number) => number;
};
