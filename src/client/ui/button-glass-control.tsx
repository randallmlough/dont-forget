import {
	GlassEffectContainer,
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
	contentShape,
	controlSize,
	disabled as disabledModifier,
	font,
	foregroundStyle,
	frame,
	glassEffect,
	padding,
	shapes,
	tint,
	type ViewModifier,
} from "@expo/ui/swift-ui/modifiers";
import type { StyleProp, ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { nativeColorScheme } from "@/client/theme/native-color-scheme";
import type { ButtonRadius } from "./button";

export type ButtonGlassSize = "default" | "sm" | "lg";

export type ButtonGlassSharedProps = {
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

type ButtonGlassContent =
	| {
			kind: "label";
			label: string;
			systemImage?: SwiftUIButtonProps["systemImage"];
	  }
	| {
			kind: "icon";
			systemImage: NonNullable<SwiftUIButtonProps["systemImage"]>;
	  };

type ButtonGlassControlProps = ButtonGlassSharedProps & {
	accessibilityLabel: string;
	content: ButtonGlassContent;
};

/**
 * Shared native control for the explicit labeled and icon-only glass buttons.
 */
export function ButtonGlassControl({
	accessibilityHint,
	accessibilityLabel,
	content,
	disabled = false,
	loading = false,
	onPress,
	radius = "md",
	showShadow = false,
	showTint = true,
	size = "default",
	style,
	testID,
}: ButtonGlassControlProps) {
	const { rt, theme } = useUnistyles();
	const sizeSpec = buttonGlassSizeSpecs[size];
	const isDisabled = disabled || loading;
	const isIconOnly = content.kind === "icon";
	const minimumTouchTarget = theme.spacing(11);
	const visualHeight = theme.spacing(sizeSpec.visualHeight);
	const shape = buttonGlassShape({ isIconOnly, radius });
	const cornerRadius =
		shape === "roundedRectangle" ? theme.radii[radius] : undefined;
	const glassTint = showTint ? theme.colors.glassTint : undefined;
	// The native glass button style draws a non-removable drop shadow, so the
	// shadowless variant recreates the material with clear glassEffect on a
	// plain button. glassEffect anchors to the bounds built up before it, so
	// padding and the visual-height frame must precede it while the
	// touch-target frame must follow it.
	const styleModifiers: ViewModifier[] = showShadow
		? [
				buttonStyle("glass"),
				buttonBorderShape(shape, cornerRadius),
				...(glassTint ? [tint(glassTint)] : []),
			]
		: [
				buttonStyle("plain"),
				...(isIconOnly
					? []
					: [
							padding({
								horizontal: theme.spacing(sizeSpec.paddingHorizontal),
							}),
						]),
				frame({
					minHeight: visualHeight,
					minWidth: isIconOnly ? visualHeight : undefined,
				}),
				glassEffect({
					glass: {
						variant: "clear",
						interactive: true,
						tint: glassTint,
					},
					shape,
					cornerRadius,
				}),
			];
	const modifiers: ViewModifier[] = [
		...styleModifiers,
		controlSize(sizeSpec.controlSize),
		frame({
			minHeight: minimumTouchTarget,
			minWidth: isIconOnly ? minimumTouchTarget : undefined,
		}),
		contentShape(shapes.rectangle()),
		disabledModifier(isDisabled),
		accessibilityLabelModifier(accessibilityLabel),
		...(accessibilityHint
			? [accessibilityHintModifier(accessibilityHint)]
			: []),
		...(loading ? [accessibilityValue("Busy")] : []),
	];
	const labelModifiers: ViewModifier[] = [
		font({ textStyle: sizeSpec.textStyle, weight: "semibold" }),
		foregroundStyle(theme.colors.foreground),
	];

	const button = (
		<SwiftUIButton modifiers={modifiers} onPress={onPress} testID={testID}>
			<HStack alignment="center" spacing={theme.spacing(2)}>
				{loading ? (
					<ProgressView modifiers={[tint(theme.colors.foreground)]} />
				) : content.systemImage ? (
					<Image
						modifiers={[...labelModifiers, accessibilityHidden()]}
						systemName={content.systemImage}
					/>
				) : null}
				{content.kind === "label" ? (
					<SwiftUIText modifiers={labelModifiers}>{content.label}</SwiftUIText>
				) : null}
			</HStack>
		</SwiftUIButton>
	);

	return (
		<Host
			colorScheme={nativeColorScheme(rt.themeName)}
			matchContents
			style={style}
		>
			{showShadow ? (
				button
			) : (
				// glassEffect shapes are expected to render inside a
				// GlassEffectContainer; without one the material is prone to
				// rendering artifacts.
				<GlassEffectContainer>{button}</GlassEffectContainer>
			)}
		</Host>
	);
}

type ButtonGlassShape = "circle" | "capsule" | "roundedRectangle";

const buttonGlassSizeSpecs: Record<
	ButtonGlassSize,
	{
		controlSize: Parameters<typeof controlSize>[0];
		/** In theme.spacing steps. */
		visualHeight: number;
		/** In theme.spacing steps. */
		paddingHorizontal: number;
		textStyle: Parameters<typeof font>[0]["textStyle"];
	}
> = {
	sm: {
		controlSize: "small",
		visualHeight: 8,
		paddingHorizontal: 3,
		textStyle: "caption",
	},
	default: {
		controlSize: "regular",
		visualHeight: 11,
		paddingHorizontal: 4,
		textStyle: "callout",
	},
	lg: {
		controlSize: "large",
		visualHeight: 13,
		paddingHorizontal: 6,
		textStyle: "body",
	},
};

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
