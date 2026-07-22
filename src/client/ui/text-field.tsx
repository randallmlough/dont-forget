import {
	Host,
	Text as SwiftUIText,
	TextField as SwiftUITextField,
	type TextFieldProps as SwiftUITextFieldProps,
	type TextFieldRef,
	useNativeState,
} from "@expo/ui/swift-ui";
import {
	accessibilityLabel as accessibilityLabelModifier,
	background,
	disabled as disabledModifier,
	font,
	foregroundStyle,
	frame,
	opacity,
	padding,
	shapes,
	textFieldStyle,
	tint,
	type ViewModifier,
} from "@expo/ui/swift-ui/modifiers";
import { type Ref, useEffect } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { nativeColorScheme } from "@/client/theme/native-color-scheme";
import type { AppTheme } from "@/client/theme/theme-contract";

const FILL_AVAILABLE_WIDTH = Infinity;

export type TextFieldVariant = "default" | "native" | "plain" | "rounded";

export type TextFieldProps = Omit<
	SwiftUITextFieldProps,
	| "children"
	| "modifiers"
	| "onFocusChange"
	| "onTextChange"
	| "placeholder"
	| "ref"
	| "selection"
	| "text"
> & {
	accessibilityLabel?: string;
	defaultValue?: string;
	disabled?: boolean;
	invalid?: boolean;
	/** Additional SwiftUI modifiers, applied after the selected variant. */
	modifiers?: SwiftUITextFieldProps["modifiers"];
	/** Native state for synchronous worklet-driven selection changes. */
	nativeSelectionState?: NonNullable<SwiftUITextFieldProps["selection"]>;
	/** Native state for synchronous worklet-driven text changes. */
	nativeTextState?: NonNullable<SwiftUITextFieldProps["text"]>;
	onChangeText?: (value: string) => void;
	onFocusChange?: (focused: boolean) => void;
	placeholder?: string;
	/** Additional SwiftUI modifiers for the placeholder text. */
	placeholderModifiers?: SwiftUITextFieldProps["modifiers"];
	ref?: Ref<TextFieldRef>;
	/** Styles the React Native Host, not the SwiftUI TextField itself. */
	style?: StyleProp<ViewStyle>;
	value?: string;
	variant?: TextFieldVariant;
};

/**
 * Experimental app-owned wrapper around Expo UI's SwiftUI TextField.
 * Use `style` for Host layout and `modifiers` for the native field itself.
 */
export function TextField({
	accessibilityLabel,
	axis = "horizontal",
	defaultValue = "",
	disabled = false,
	invalid = false,
	modifiers,
	nativeSelectionState,
	nativeTextState,
	onChangeText,
	onFocusChange,
	placeholder,
	placeholderModifiers,
	ref,
	style,
	value,
	variant = "default",
	...swiftUITextFieldProps
}: TextFieldProps) {
	const { rt, theme } = useUnistyles();
	const internalTextState = useNativeState(value ?? defaultValue);
	const text = nativeTextState ?? internalTextState;
	const colorScheme = nativeColorScheme(rt.themeName);
	const fieldModifiers = createFieldModifiers({
		disabled,
		invalid,
		theme,
		variant,
	});

	// useNativeState captures its initial value once, so controlled JS updates
	// must cross the SwiftUI boundary explicitly.
	useEffect(() => {
		if (value !== undefined && !nativeTextState) text.set(value);
	}, [nativeTextState, text, value]);

	function handleFocusChange(nextFocused: boolean) {
		onFocusChange?.(nextFocused);
	}

	return (
		<Host
			colorScheme={colorScheme}
			style={[
				styles.host,
				axis === "vertical" ? styles.verticalHost : undefined,
				style,
			]}
		>
			<SwiftUITextField
				axis={axis}
				modifiers={[
					...(accessibilityLabel
						? [accessibilityLabelModifier(accessibilityLabel)]
						: []),
					...fieldModifiers,
					...(modifiers ?? []),
				]}
				onFocusChange={handleFocusChange}
				onTextChange={onChangeText}
				ref={ref}
				selection={nativeSelectionState}
				text={text}
				{...swiftUITextFieldProps}
			>
				{placeholder !== undefined ? (
					<SwiftUITextField.Placeholder>
						<SwiftUIText
							modifiers={[
								font({ textStyle: "body" }),
								foregroundStyle(theme.colors.mutedForeground),
								...(placeholderModifiers ?? []),
							]}
						>
							{placeholder}
						</SwiftUIText>
					</SwiftUITextField.Placeholder>
				) : null}
			</SwiftUITextField>
		</Host>
	);
}

function createFieldModifiers({
	disabled,
	invalid,
	theme,
	variant,
}: {
	disabled: boolean;
	invalid: boolean;
	theme: AppTheme;
	variant: TextFieldVariant;
}): ViewModifier[] {
	const commonModifiers: ViewModifier[] = [
		font({ textStyle: "body" }),
		foregroundStyle(
			invalid ? theme.colors.destructive : theme.colors.foreground,
		),
		tint(invalid ? theme.colors.destructive : theme.colors.primary),
		frame({
			minHeight: theme.spacing(11),
			maxWidth: FILL_AVAILABLE_WIDTH,
			alignment: "leading",
		}),
	];

	if (variant === "default") {
		commonModifiers.push(
			textFieldStyle("plain"),
			padding({ horizontal: theme.spacing(3) }),
			background(
				disabled ? theme.colors.muted : theme.colors.card,
				shapes.roundedRectangle({ cornerRadius: theme.radii.md }),
			),
		);
	} else {
		commonModifiers.push(
			textFieldStyle(
				variant === "rounded"
					? "roundedBorder"
					: variant === "plain"
						? "plain"
						: "automatic",
			),
		);
	}

	commonModifiers.push(
		disabledModifier(disabled),
		opacity(disabled ? theme.opacities.disabled : 1),
	);

	return commonModifiers;
}

const styles = StyleSheet.create((theme) => ({
	host: {
		width: "100%",
		height: theme.spacing(13),
	},
	verticalHost: {
		height: theme.spacing(28),
	},
}));
