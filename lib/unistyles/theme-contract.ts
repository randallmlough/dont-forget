import type { TextStyle } from "react-native";

type FontWeight = NonNullable<TextStyle["fontWeight"]>;

type TypographyStyle = {
	fontSize: number;
	fontWeight?: FontWeight;
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
	};
	effects: {
		addItemComposer: {
			entryBackground: string;
			entryBorder: string;
			trayBackground: string;
			trayBorder: string;
			inputBackground: string;
			inputBorder: string;
			fieldBackground: string;
			pillBackground: string;
			pillBorder: string;
			selectedPillBackground: string;
			selectedPillBorder: string;
			entryShadow: string;
			trayShadow: string;
		};
	};
	radii: {
		card: number;
		control: number;
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
