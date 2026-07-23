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
	tint,
	type ViewModifier,
} from "@expo/ui/swift-ui/modifiers";
import type { StyleProp, ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { nativeColorScheme } from "@/client/theme/native-color-scheme";

export type ButtonGlassSize = "default" | "sm" | "lg";

export type ButtonGlassProps = {
	accessibilityHint?: string;
	accessibilityLabel?: string;
	disabled?: boolean;
	label: string;
	loading?: boolean;
	onPress?: () => void;
	size?: ButtonGlassSize;
	/** Styles the React Native Host around the SwiftUI button. */
	style?: StyleProp<ViewStyle>;
	systemImage?: SwiftUIButtonProps["systemImage"];
	testID?: string;
};

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
	size = "default",
	style,
	systemImage,
	testID,
}: ButtonGlassProps) {
	const { rt, theme } = useUnistyles();
	const isDisabled = disabled || loading;
	const modifiers: ViewModifier[] = [
		buttonStyle("glass"),
		buttonBorderShape("roundedRectangle", theme.radii.md),
		controlSize(nativeControlSize(size)),
		tint(theme.colors.glassTint),
		frame({
			minHeight: size === "lg" ? theme.spacing(13) : theme.spacing(11),
		}),
		disabledModifier(isDisabled),
		accessibilityLabelModifier(accessibilityLabel ?? label),
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
					<SwiftUIText modifiers={labelModifiers}>{label}</SwiftUIText>
				</HStack>
			</SwiftUIButton>
		</Host>
	);
}

type NativeControlSize = Parameters<typeof controlSize>[0];

function nativeControlSize(size: ButtonGlassSize): NativeControlSize {
	if (size === "sm") return "small";
	if (size === "lg") return "large";
	return "regular";
}
