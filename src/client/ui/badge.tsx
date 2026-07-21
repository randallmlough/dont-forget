import { type ComponentRef, forwardRef, type ReactNode } from "react";
import {
	type StyleProp,
	Text,
	type TextStyle,
	View,
	type ViewProps,
	type ViewStyle,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";

export type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export type BadgeProps = Omit<ViewProps, "children" | "style"> & {
	children?: ReactNode;
	variant?: BadgeVariant;
	style?: StyleProp<ViewStyle>;
	textStyle?: StyleProp<TextStyle>;
};

type BadgeRef = ComponentRef<typeof View>;

export const Badge = forwardRef<BadgeRef, BadgeProps>(function Badge(
	{ children, style, textStyle, variant = "default", ...viewProps },
	ref,
) {
	const hasTextChild =
		typeof children === "string" || typeof children === "number";

	styles.useVariants({
		variant: variant === "default" ? undefined : variant,
	});

	return (
		<View ref={ref} style={[styles.container, style]} {...viewProps}>
			{hasTextChild ? (
				<Text style={[styles.label, textStyle]}>{children}</Text>
			) : (
				children
			)}
		</View>
	);
});

const styles = StyleSheet.create((theme) => ({
	container: {
		alignSelf: "flex-start",
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: theme.spacing(2),
		paddingVertical: theme.spacing(0.5),
		borderRadius: theme.radii.sm,
		borderWidth: theme.borders.thin,
		borderColor: "transparent",
		backgroundColor: theme.colors.primary,
		variants: {
			variant: {
				default: {
					borderColor: "transparent",
					backgroundColor: theme.colors.primary,
				},
				secondary: {
					borderColor: "transparent",
					backgroundColor: theme.colors.secondary,
				},
				destructive: {
					borderColor: "transparent",
					backgroundColor: theme.colors.destructive,
				},
				outline: {
					borderColor: theme.colors.border,
					backgroundColor: "transparent",
				},
			},
		},
	},
	label: {
		...theme.typography.captionStrong,
		color: theme.colors.primaryForeground,
		variants: {
			variant: {
				default: {
					color: theme.colors.primaryForeground,
				},
				secondary: {
					color: theme.colors.secondaryForeground,
				},
				destructive: {
					color: theme.colors.destructiveForeground,
				},
				outline: {
					color: theme.colors.foreground,
				},
			},
		},
	},
}));
