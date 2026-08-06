import { Host, HStack } from "@expo/ui/swift-ui";
import {
	onTapGesture,
	opacity,
	type ViewModifier,
} from "@expo/ui/swift-ui/modifiers";
import { nativeColorScheme } from "@mobile/theme/native-color-scheme";
import { type ReactNode, use, useMemo, useRef, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { FieldContext } from "./field";
import {
	type FocusableInputRef,
	InputGroupContext,
	type InputGroupContextValue,
} from "./input";
import { createInputModifiers, omitUserOverridden } from "./input-modifiers";

export type InputGroupProps = {
	/** SwiftUI children: addons (Image, Button, …) and one Input, in order. */
	children?: ReactNode;
	/** Defaults to the surrounding Field's disabled state. */
	disabled?: boolean;
	/** Defaults to the surrounding Field's invalid state. */
	invalid?: boolean;
	/**
	 * Additional SwiftUI modifiers for the group surface, applied after the
	 * app styling. A user modifier takes ownership of its `$type`, same as
	 * Input: e.g. a custom `background` replaces it instead of wrapping it.
	 */
	modifiers?: ViewModifier[];
	style?: StyleProp<ViewStyle>;
};

/**
 * shadcn-style input group: a Host-level HStack that owns the bordered input
 * surface so SwiftUI addons (SF Symbol Images, Buttons) sit inside it.
 * The Input child detects the group via context and renders bare.
 */
export function InputGroup({
	children,
	disabled,
	invalid,
	modifiers,
	style,
}: InputGroupProps) {
	const { rt, theme } = useUnistyles();
	const field = use(FieldContext);
	const [inputFocused, setInputFocused] = useState(false);
	const inputRef = useRef<FocusableInputRef | null>(null);
	const isDisabled = disabled ?? field.disabled;
	const isInvalid = invalid ?? field.invalid;

	const contextValue = useMemo<InputGroupContextValue>(
		() => ({
			disabled: isDisabled,
			invalid: isInvalid,
			onInputRef: (node) => {
				inputRef.current = node;
			},
			onInputFocusChange: setInputFocused,
		}),
		[isDisabled, isInvalid],
	);

	return (
		<Host
			colorScheme={nativeColorScheme(rt.themeName)}
			matchContents={{ vertical: true }}
			style={[styles.host, style]}
		>
			<HStack
				alignment="center"
				modifiers={[
					...omitUserOverridden(
						createInputModifiers({
							disabled: isDisabled,
							focused: inputFocused,
							invalid: isInvalid,
							theme,
						}),
						modifiers,
					),
					...(modifiers ?? []),
					// onTapGesture stores this closure as a native event listener that
					// runs on tap, not during render, so the ref read is commit-safe.
					// eslint-disable-next-line react-hooks/refs
					onTapGesture(() => {
						void inputRef.current?.focus();
					}),
					// Dim only for the group's own disabled prop; a disabled Field
					// already dims all of its children.
					opacity(disabled ? theme.opacities.disabled : 1),
				]}
				spacing={theme.spacing(2)}
			>
				<InputGroupContext value={contextValue}>{children}</InputGroupContext>
			</HStack>
		</Host>
	);
}

const styles = StyleSheet.create({
	host: {
		width: "100%",
	},
});
