import type { ComponentRef, Ref } from "react";
import {
	type StyleProp,
	Text,
	type TextProps,
	type TextStyle,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";

export type LabelProps = Omit<TextProps, "style"> & {
	disabled?: boolean;
	ref?: Ref<ComponentRef<typeof Text>>;
	style?: StyleProp<TextStyle>;
};

/**
 * Text label for a nearby native control.
 *
 * React Native has no `htmlFor` equivalent. Give the control an explicit
 * `accessibilityLabel`, and keep this label adjacent to it in the layout.
 */
export function Label({
	disabled = false,
	ref,
	style,
	...textProps
}: LabelProps) {
	return (
		<Text
			ref={ref}
			style={[styles.label, disabled ? styles.disabled : undefined, style]}
			{...textProps}
		/>
	);
}

const styles = StyleSheet.create((theme) => ({
	label: {
		color: theme.colors.foreground,
		...theme.typography.callout,
		fontWeight: theme.fontWeights.medium,
	},
	disabled: {
		opacity: theme.opacities.disabled,
	},
}));
