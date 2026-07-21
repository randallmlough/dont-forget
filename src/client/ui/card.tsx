import { type ComponentRef, forwardRef } from "react";
import {
	type StyleProp,
	Text,
	type TextProps,
	type TextStyle,
	View,
	type ViewProps,
	type ViewStyle,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";

export type CardProps = Omit<ViewProps, "style"> & {
	style?: StyleProp<ViewStyle>;
};

export type CardHeaderProps = Omit<ViewProps, "style"> & {
	style?: StyleProp<ViewStyle>;
};

export type CardTitleProps = Omit<TextProps, "style"> & {
	style?: StyleProp<TextStyle>;
};

export type CardDescriptionProps = Omit<TextProps, "style"> & {
	style?: StyleProp<TextStyle>;
};

export type CardContentProps = Omit<ViewProps, "style"> & {
	style?: StyleProp<ViewStyle>;
};

export type CardFooterProps = Omit<ViewProps, "style"> & {
	style?: StyleProp<ViewStyle>;
};

type CardRef = ComponentRef<typeof View>;
type CardTextRef = ComponentRef<typeof Text>;

export const Card = forwardRef<CardRef, CardProps>(function Card(
	{ style, ...viewProps },
	ref,
) {
	return <View ref={ref} style={[styles.card, style]} {...viewProps} />;
});

export const CardHeader = forwardRef<CardRef, CardHeaderProps>(
	function CardHeader({ style, ...viewProps }, ref) {
		return <View ref={ref} style={[styles.header, style]} {...viewProps} />;
	},
);

export const CardTitle = forwardRef<CardTextRef, CardTitleProps>(
	function CardTitle({ style, ...textProps }, ref) {
		return <Text ref={ref} style={[styles.title, style]} {...textProps} />;
	},
);

export const CardDescription = forwardRef<CardTextRef, CardDescriptionProps>(
	function CardDescription({ style, ...textProps }, ref) {
		return (
			<Text ref={ref} style={[styles.description, style]} {...textProps} />
		);
	},
);

export const CardContent = forwardRef<CardRef, CardContentProps>(
	function CardContent({ style, ...viewProps }, ref) {
		return <View ref={ref} style={[styles.content, style]} {...viewProps} />;
	},
);

export const CardFooter = forwardRef<CardRef, CardFooterProps>(
	function CardFooter({ style, ...viewProps }, ref) {
		return <View ref={ref} style={[styles.footer, style]} {...viewProps} />;
	},
);

const styles = StyleSheet.create((theme) => ({
	card: {
		borderRadius: theme.radii.lg,
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		backgroundColor: theme.colors.card,
	},
	header: {
		padding: theme.spacing(6),
		paddingBottom: theme.spacing(4),
	},
	title: {
		fontSize: theme.fontSizes.lg,
		fontWeight: theme.fontWeights.semibold,
		lineHeight: theme.lineHeights.lg,
		color: theme.colors.cardForeground,
	},
	description: {
		...theme.typography.callout,
		color: theme.colors.mutedForeground,
	},
	content: {
		padding: theme.spacing(6),
		paddingTop: 0,
	},
	footer: {
		flexDirection: "row",
		alignItems: "center",
		padding: theme.spacing(6),
		paddingTop: 0,
	},
}));
