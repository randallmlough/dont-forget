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
		authBackground: string;
		surface: string;
		text: string;
		textStrong: string;
		textMuted: string;
		textSubtle: string;
		border: string;
		inputBorder: string;
		authBorder: string;
		divider: string;
		primary: string;
		primaryDisabled: string;
		destructive: string;
		link: string;
		authPrimary: string;
		inverseText: string;
		scrim: string;
	};
	radii: {
		card: number;
		control: number;
		pill: number;
		checkbox: number;
		checkboxMark: number;
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
	typography: {
		largeTitle: TypographyStyle;
		title: TypographyStyle;
		headline: TypographyStyle;
		body: TypographyStyle;
		callout: TypographyStyle;
		caption: TypographyStyle;
		captionStrong: TypographyStyle;
		controlLabel: TypographyStyle;
	};
	opacities: {
		pressed: number;
		disabled: number;
	};
	borders: {
		hairline: number;
		thin: number;
		thick: number;
	};
	spacing: (step: number) => number;
};
