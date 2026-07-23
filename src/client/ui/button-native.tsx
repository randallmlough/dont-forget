import {
	Host,
	HStack,
	ProgressView,
	RNHostView,
	Button as SwiftUIButton,
	Text as SwiftUIText,
} from "@expo/ui/swift-ui";
import {
	accessibilityHint as accessibilityHintModifier,
	accessibilityLabel as accessibilityLabelModifier,
	accessibilityValue,
	buttonBorderShape,
	buttonStyle,
	controlSize,
	disabled as disabledModifier,
	font,
	foregroundStyle,
	frame,
	kerning,
	lineSpacing,
	multilineTextAlignment,
	strikethrough,
	tint,
	underline,
	type ViewModifier,
} from "@expo/ui/swift-ui/modifiers";
import type { ReactNode } from "react";
import {
	StyleSheet as ReactNativeStyleSheet,
	type StyleProp,
	type TextStyle,
	View,
	type ViewStyle,
} from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { nativeColorScheme } from "@/client/theme/native-color-scheme";
import type { AppTheme } from "@/client/theme/theme-contract";
import type { ButtonRadius, ButtonSize, ButtonVariant } from "./button";

export type ButtonNativeProps = {
	accessibilityHint?: string;
	accessibilityLabel?: string;
	children?: ReactNode;
	disabled?: boolean;
	loading?: boolean;
	onPress?: () => void;
	/** Theme radius token applied through SwiftUI's button border shape. */
	radius?: ButtonRadius;
	size?: ButtonSize;
	/** Styles the React Native Host that contains the SwiftUI button. */
	style?: StyleProp<ViewStyle>;
	testID?: string;
	textStyle?: StyleProp<TextStyle>;
	variant?: ButtonVariant;
};

/**
 * Experimental Expo UI implementation of the app Button contract.
 *
 * Text content stays entirely in SwiftUI. Custom React Native children cross an
 * RNHostView boundary, which is useful for testing migration compatibility but
 * should be treated as a cost of adopting the native control.
 */
export function ButtonNative({
	accessibilityHint,
	accessibilityLabel,
	children,
	disabled = false,
	loading = false,
	onPress,
	radius = "md",
	size = "default",
	style,
	testID,
	textStyle,
	variant = "default",
}: ButtonNativeProps) {
	const { rt, theme } = useUnistyles();
	const isDisabled = disabled || loading;
	const textLabel =
		typeof children === "string" || typeof children === "number"
			? String(children)
			: undefined;
	const resolvedAccessibilityLabel = accessibilityLabel ?? textLabel;
	const modifiers: ViewModifier[] = [
		buttonStyle(nativeButtonStyle(variant)),
		buttonBorderShape("roundedRectangle", theme.radii[radius]),
		controlSize(nativeControlSize(size)),
		tint(nativeTint(theme, variant)),
		frame(nativeFrame(theme, size)),
		disabledModifier(isDisabled),
		...(resolvedAccessibilityLabel
			? [accessibilityLabelModifier(resolvedAccessibilityLabel)]
			: []),
		...(accessibilityHint
			? [accessibilityHintModifier(accessibilityHint)]
			: []),
		...(loading ? [accessibilityValue("Busy")] : []),
	];

	return (
		<Host
			colorScheme={nativeColorScheme(rt.themeName)}
			matchContents
			style={style}
		>
			<SwiftUIButton
				modifiers={modifiers}
				onPress={onPress}
				role={variant === "destructive" ? "destructive" : "default"}
				testID={testID}
			>
				<HStack alignment="center" spacing={theme.spacing(2)}>
					{loading ? (
						<ProgressView
							modifiers={[tint(nativeLabelColor(theme, variant))]}
						/>
					) : null}
					{textLabel !== undefined ? (
						<SwiftUIText
							modifiers={nativeLabelModifiers({
								size,
								textStyle,
								theme,
								variant,
							})}
						>
							{textLabel}
						</SwiftUIText>
					) : children ? (
						<RNHostView matchContents>
							<View>{children}</View>
						</RNHostView>
					) : null}
				</HStack>
			</SwiftUIButton>
		</Host>
	);
}

type NativeButtonStyle = Parameters<typeof buttonStyle>[0];
type NativeControlSize = Parameters<typeof controlSize>[0];
type NativeFontWeight = NonNullable<Parameters<typeof font>[0]["weight"]>;

function nativeButtonStyle(variant: ButtonVariant): NativeButtonStyle {
	const styles = {
		default: "borderedProminent",
		destructive: "borderedProminent",
		outline: "bordered",
		secondary: "borderedProminent",
		ghost: "plain",
		glass: "glass",
		link: "plain",
	} satisfies Record<ButtonVariant, NativeButtonStyle>;

	return styles[variant];
}

function nativeControlSize(size: ButtonSize): NativeControlSize {
	if (size === "sm") return "small";
	if (size === "lg") return "large";
	return "regular";
}

function nativeFrame(theme: AppTheme, size: ButtonSize) {
	const minHeight = size === "lg" ? theme.spacing(13) : theme.spacing(11);

	return size === "icon"
		? { width: theme.spacing(11), minHeight }
		: { minHeight };
}

function nativeTint(theme: AppTheme, variant: ButtonVariant): string {
	if (variant === "destructive") return theme.colors.destructive;
	if (variant === "secondary") return theme.colors.secondary;
	if (variant === "link") return theme.colors.link;
	if (variant === "outline" || variant === "ghost") {
		return theme.colors.foreground;
	}
	if (variant === "glass") return theme.colors.glassTint;
	return theme.colors.primary;
}

function nativeLabelColor(theme: AppTheme, variant: ButtonVariant): string {
	if (variant === "destructive") return theme.colors.destructiveForeground;
	if (variant === "secondary") return theme.colors.secondaryForeground;
	if (variant === "link") return theme.colors.link;
	if (variant === "outline" || variant === "ghost" || variant === "glass") {
		return theme.colors.foreground;
	}
	return theme.colors.primaryForeground;
}

function nativeLabelModifiers({
	size,
	textStyle,
	theme,
	variant,
}: {
	size: ButtonSize;
	textStyle: StyleProp<TextStyle>;
	theme: AppTheme;
	variant: ButtonVariant;
}): ViewModifier[] {
	const typography =
		size === "sm"
			? theme.typography.captionStrong
			: size === "lg"
				? theme.typography.body
				: theme.typography.callout;
	const appLabelStyle: TextStyle = {
		...typography,
		color: nativeLabelColor(theme, variant),
		fontWeight: theme.fontWeights.semibold,
		textDecorationLine: variant === "link" ? "underline" : "none",
	};
	const resolved = ReactNativeStyleSheet.flatten([appLabelStyle, textStyle]);
	const modifiers: ViewModifier[] = [
		font({
			family: resolved.fontFamily,
			size: resolved.fontSize,
			weight: nativeFontWeight(resolved.fontWeight),
		}),
		foregroundStyle(resolved.color ?? nativeLabelColor(theme, variant)),
	];

	if (resolved.letterSpacing !== undefined) {
		modifiers.push(kerning(resolved.letterSpacing));
	}
	if (resolved.lineHeight !== undefined && resolved.fontSize !== undefined) {
		modifiers.push(
			lineSpacing(Math.max(0, resolved.lineHeight - resolved.fontSize)),
		);
	}
	if (resolved.textAlign) {
		modifiers.push(
			multilineTextAlignment(nativeTextAlignment(resolved.textAlign)),
		);
	}
	if (resolved.textDecorationLine?.includes("underline")) {
		modifiers.push(underline({ isActive: true, pattern: "solid" }));
	}
	if (resolved.textDecorationLine?.includes("line-through")) {
		modifiers.push(strikethrough({ isActive: true, pattern: "solid" }));
	}

	return modifiers;
}

function nativeFontWeight(weight: TextStyle["fontWeight"]): NativeFontWeight {
	switch (weight) {
		case "100":
			return "ultraLight";
		case "200":
			return "thin";
		case "300":
			return "light";
		case "normal":
		case "400":
			return "regular";
		case "500":
			return "medium";
		case "600":
			return "semibold";
		case "bold":
		case "700":
			return "bold";
		case "800":
			return "heavy";
		case "900":
			return "black";
		default:
			return "semibold";
	}
}

function nativeTextAlignment(
	textAlign: NonNullable<TextStyle["textAlign"]>,
): "center" | "leading" | "trailing" {
	if (textAlign === "center") return "center";
	if (textAlign === "right") return "trailing";
	return "leading";
}
