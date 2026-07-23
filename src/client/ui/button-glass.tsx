import {
	Host,
	HStack,
	Image,
	ProgressView,
	Button as SwiftUIButton,
	type ButtonProps as SwiftUIButtonProps,
	Text as SwiftUIText,
} from "@expo/ui/swift-ui";
import {
	accessibilityHidden,
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
	glassEffect,
	padding,
	tint,
	type ViewModifier,
} from "@expo/ui/swift-ui/modifiers";
import type { StyleProp, ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { nativeColorScheme } from "@/client/theme/native-color-scheme";
import type { ButtonRadius } from "./button";

export type ButtonGlassSize = "default" | "sm" | "lg";

type ButtonGlassBaseProps = {
	accessibilityHint?: string;
	disabled?: boolean;
	loading?: boolean;
	onPress?: () => void;
	radius?: ButtonRadius;
	/** Uses the elevated native glass button style when true. @default false */
	showShadow?: boolean;
	/** Applies the app glass tint when true. @default true */
	showTint?: boolean;
	size?: ButtonGlassSize;
	/** Styles the React Native Host around the SwiftUI button. */
	style?: StyleProp<ViewStyle>;
	testID?: string;
};

type ButtonGlassLabelProps =
	| {
			accessibilityLabel?: string;
			label: string;
			systemImage?: SwiftUIButtonProps["systemImage"];
	  }
	| {
			accessibilityLabel: string;
			label?: never;
			systemImage: NonNullable<SwiftUIButtonProps["systemImage"]>;
	  };

export type ButtonGlassProps = ButtonGlassBaseProps & ButtonGlassLabelProps;

/**
 * App-owned native Liquid Glass button.
 *
 * Its intentionally narrow contract keeps all label content in SwiftUI so the
 * control never needs an RNHostView bridge.
 */
export function ButtonGlass({
	accessibilityHint,
	accessibilityLabel,
	disabled = false,
	label,
	loading = false,
	onPress,
	radius = "md",
	showShadow = false,
	showTint = true,
	size = "default",
	style,
	systemImage,
	testID,
}: ButtonGlassProps) {
	const { rt, theme } = useUnistyles();
	const isDisabled = disabled || loading;
	const isIconOnly = label === undefined;
	const minimumSize = size === "lg" ? theme.spacing(13) : theme.spacing(11);
	const shape = buttonGlassShape({ isIconOnly, radius });
	const cornerRadius =
		shape === "roundedRectangle" ? theme.radii[radius] : undefined;
	const glassTint = showTint ? theme.colors.glassTint : undefined;
	const resolvedAccessibilityLabel =
		label === undefined ? accessibilityLabel : (accessibilityLabel ?? label);
	const modifiers: ViewModifier[] = [
		buttonStyle(showShadow ? "glass" : "plain"),
		...(showShadow
			? [
					buttonBorderShape(shape, cornerRadius),
					...(glassTint ? [tint(glassTint)] : []),
				]
			: []),
		controlSize(nativeControlSize(size)),
		frame({
			minHeight: minimumSize,
			...(isIconOnly ? { minWidth: minimumSize } : {}),
		}),
		...(!showShadow
			? [
					...(!isIconOnly
						? [
								padding({
									horizontal:
										size === "sm"
											? theme.spacing(3)
											: size === "lg"
												? theme.spacing(6)
												: theme.spacing(4),
								}),
							]
						: []),
					glassEffect({
						glass: {
							variant: "clear",
							interactive: true,
							tint: glassTint,
						},
						shape,
						cornerRadius,
					}),
				]
			: []),
		disabledModifier(isDisabled),
		accessibilityLabelModifier(resolvedAccessibilityLabel),
		...(accessibilityHint
			? [accessibilityHintModifier(accessibilityHint)]
			: []),
		...(loading ? [accessibilityValue("Busy")] : []),
	];
	const labelModifiers: ViewModifier[] = [
		font({
			textStyle: size === "sm" ? "caption" : size === "lg" ? "body" : "callout",
			weight: "semibold",
		}),
		foregroundStyle(theme.colors.foreground),
	];

	return (
		<Host
			colorScheme={nativeColorScheme(rt.themeName)}
			matchContents
			style={style}
		>
			<SwiftUIButton modifiers={modifiers} onPress={onPress} testID={testID}>
				<HStack alignment="center" spacing={theme.spacing(2)}>
					{loading ? (
						<ProgressView modifiers={[tint(theme.colors.foreground)]} />
					) : systemImage ? (
						<Image
							modifiers={[...labelModifiers, accessibilityHidden()]}
							systemName={systemImage}
						/>
					) : null}
					{label !== undefined ? (
						<SwiftUIText modifiers={labelModifiers}>{label}</SwiftUIText>
					) : null}
				</HStack>
			</SwiftUIButton>
		</Host>
	);
}

type NativeControlSize = Parameters<typeof controlSize>[0];
type ButtonGlassShape = "circle" | "capsule" | "roundedRectangle";

function nativeControlSize(size: ButtonGlassSize): NativeControlSize {
	if (size === "sm") return "small";
	if (size === "lg") return "large";
	return "regular";
}

function buttonGlassShape({
	isIconOnly,
	radius,
}: {
	isIconOnly: boolean;
	radius: ButtonRadius;
}): ButtonGlassShape {
	if (isIconOnly) return "circle";
	if (radius === "full") return "capsule";
	return "roundedRectangle";
}
