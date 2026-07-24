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
	contentShape,
	controlSize,
	disabled as disabledModifier,
	font,
	foregroundStyle,
	frame,
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
	const shape = buttonGlassShape({ isIconOnly, radius });
	const cornerRadius =
		shape === "roundedRectangle" ? theme.radii[radius] : undefined;
	const glassTint = showTint ? theme.colors.glassTint : undefined;
	// The shadowless variant swaps the button style's material for clear glass
	// via the patched buttonStyle glass options (patches/@expo__ui). Clear glass
	// requires GlassButtonStyle(_:) from iOS 26.1; 26.0 falls back to the
	// default (shadowed) glass style.
	const styleModifiers: ViewModifier[] = showShadow
		? [buttonStyle("glass"), ...(glassTint ? [tint(glassTint)] : [])]
		: [
				buttonStyle("glass", {
					glass: {
						variant: "clear",
						interactive: true,
						tint: glassTint,
					},
				}),
			];
	const modifiers: ViewModifier[] = [
		...styleModifiers,
		buttonBorderShape(shape, cornerRadius),
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
					) : content.systemImage ? (
						<Image
							modifiers={[...labelModifiers, accessibilityHidden()]}
							systemName={content.systemImage}
						/>
					) : null}
					{content.kind === "label" ? (
						<SwiftUIText modifiers={labelModifiers}>
							{content.label}
						</SwiftUIText>
					) : null}
				</HStack>
			</SwiftUIButton>
		</Host>
	);
}

type ButtonGlassShape = "circle" | "capsule" | "roundedRectangle";

const buttonGlassSizeSpecs: Record<
	ButtonGlassSize,
	{
		controlSize: Parameters<typeof controlSize>[0];
		textStyle: Parameters<typeof font>[0]["textStyle"];
	}
> = {
	sm: {
		controlSize: "small",
		textStyle: "caption",
	},
	default: {
		controlSize: "regular",
		textStyle: "callout",
	},
	lg: {
		controlSize: "large",
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
