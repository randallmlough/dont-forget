import { type ComponentRef, forwardRef, type ReactNode } from "react";
import {
	type AccessibilityState,
	ActivityIndicator,
	Pressable,
	type PressableProps,
	type StyleProp,
	Text,
	type TextStyle,
	View,
	type ViewStyle,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import type { AppTheme } from "@/client/theme/theme-contract";
import { GlassSurface } from "./glass-surface";

export type ButtonVariant =
	| "default"
	| "destructive"
	| "outline"
	| "secondary"
	| "ghost"
	| "glass"
	| "link";

export type ButtonSize = "default" | "sm" | "lg" | "icon";
export type ButtonRadius = keyof AppTheme["radii"];

/**
 * Native press props are intentionally exposed because Button is the shared UI
 * primitive for accessibility, testing, and interaction behavior.
 */
export type ButtonProps = Omit<PressableProps, "children" | "style"> & {
	children?: ReactNode;
	variant?: ButtonVariant;
	size?: ButtonSize;
	/** Theme radius token applied to the button container. @default "md" */
	radius?: ButtonRadius;
	loading?: boolean;
	style?: StyleProp<ViewStyle>;
	textStyle?: StyleProp<TextStyle>;
};

type ButtonRef = ComponentRef<typeof Pressable>;

export const Button = forwardRef<ButtonRef, ButtonProps>(function Button(
	{
		accessibilityRole,
		accessibilityState,
		children,
		disabled = false,
		loading = false,
		radius = "md",
		size = "default",
		style,
		textStyle,
		variant = "default",
		...pressableProps
	},
	ref,
) {
	const { theme } = useUnistyles();
	const isDisabled = disabled || loading;
	const hasTextChild =
		typeof children === "string" || typeof children === "number";
	const usesPressedSurface = variant === "outline" || variant === "ghost";
	const buttonAccessibilityState: AccessibilityState = {
		...accessibilityState,
		disabled: isDisabled,
		busy: loading,
	};

	styles.useVariants({
		radius,
		size: size === "default" ? undefined : size,
		variant: variant === "default" ? undefined : variant,
	});

	const spinnerColor =
		variant === "destructive"
			? theme.colors.destructiveForeground
			: variant === "secondary"
				? theme.colors.secondaryForeground
				: variant === "link"
					? theme.colors.link
					: variant === "outline" || variant === "ghost" || variant === "glass"
						? theme.colors.foreground
						: theme.colors.primaryForeground;

	return (
		<Pressable
			accessibilityRole={accessibilityRole ?? "button"}
			accessibilityState={buttonAccessibilityState}
			disabled={isDisabled}
			ref={ref}
			style={({ pressed }) => [
				styles.container,
				style,
				pressed
					? usesPressedSurface
						? styles.pressedSurface
						: styles.pressed
					: undefined,
				isDisabled ? styles.disabled : undefined,
			]}
			{...pressableProps}
		>
			{variant === "glass" ? (
				<GlassSurface interactive style={styles.glassSurface}>
					<View />
				</GlassSurface>
			) : null}
			{loading ? (
				<ActivityIndicator
					accessibilityElementsHidden
					accessible={false}
					color={spinnerColor}
					size="small"
				/>
			) : null}
			{hasTextChild ? (
				<Text style={[styles.label, textStyle]}>{children}</Text>
			) : (
				children
			)}
		</Pressable>
	);
});

const styles = StyleSheet.create((theme) => ({
	container: {
		minHeight: theme.spacing(11),
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: theme.spacing(2),
		borderWidth: theme.borders.thin,
		borderColor: "transparent",
		borderRadius: theme.radii.md,
		backgroundColor: theme.colors.primary,
		variants: {
			radius: {
				none: {
					borderRadius: theme.radii.none,
				},
				sm: {
					borderRadius: theme.radii.sm,
				},
				md: {
					borderRadius: theme.radii.md,
				},
				lg: {
					borderRadius: theme.radii.lg,
				},
				xl: {
					borderRadius: theme.radii.xl,
				},
				"2xl": {
					borderRadius: theme.radii["2xl"],
				},
				full: {
					borderRadius: theme.radii.full,
				},
			},
			variant: {
				default: {
					backgroundColor: theme.colors.primary,
				},
				destructive: {
					backgroundColor: theme.colors.destructive,
				},
				outline: {
					borderColor: theme.colors.input,
					backgroundColor: theme.colors.background,
				},
				secondary: {
					backgroundColor: theme.colors.secondary,
				},
				ghost: {
					backgroundColor: "transparent",
				},
				glass: {
					borderColor: "transparent",
					backgroundColor: "transparent",
				},
				link: {
					paddingHorizontal: 0,
					backgroundColor: "transparent",
				},
			},
			size: {
				default: {
					paddingHorizontal: theme.spacing(4),
				},
				sm: {
					paddingHorizontal: theme.spacing(3),
				},
				lg: {
					minHeight: theme.spacing(13),
					paddingHorizontal: theme.spacing(6),
				},
				icon: {
					width: theme.spacing(11),
					paddingHorizontal: 0,
				},
			},
		},
	},
	label: {
		...theme.typography.callout,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.primaryForeground,
		variants: {
			variant: {
				default: {
					color: theme.colors.primaryForeground,
				},
				destructive: {
					color: theme.colors.destructiveForeground,
				},
				outline: {
					color: theme.colors.foreground,
				},
				secondary: {
					color: theme.colors.secondaryForeground,
				},
				ghost: {
					color: theme.colors.foreground,
				},
				glass: {
					color: theme.colors.foreground,
				},
				link: {
					color: theme.colors.link,
					textDecorationLine: "underline",
				},
			},
			size: {
				default: {
					...theme.typography.callout,
				},
				sm: {
					...theme.typography.captionStrong,
				},
				lg: {
					...theme.typography.body,
				},
				icon: {
					...theme.typography.callout,
				},
			},
		},
	},
	glassSurface: {
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		borderRadius: theme.radii.md,
		variants: {
			radius: {
				none: {
					borderRadius: theme.radii.none,
				},
				sm: {
					borderRadius: theme.radii.sm,
				},
				md: {
					borderRadius: theme.radii.md,
				},
				lg: {
					borderRadius: theme.radii.lg,
				},
				xl: {
					borderRadius: theme.radii.xl,
				},
				"2xl": {
					borderRadius: theme.radii["2xl"],
				},
				full: {
					borderRadius: theme.radii.full,
				},
			},
		},
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
	pressedSurface: {
		backgroundColor: theme.colors.secondary,
	},
	disabled: {
		opacity: theme.opacities.disabled,
	},
}));
