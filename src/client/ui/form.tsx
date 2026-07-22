import type { ComponentRef, Ref } from "react";
import {
	type StyleProp,
	View,
	type ViewProps,
	type ViewStyle,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";

export type FormProps = Omit<ViewProps, "style"> & {
	ref?: Ref<ComponentRef<typeof View>>;
	style?: StyleProp<ViewStyle>;
};

/**
 * Library-neutral layout for a form's fields and actions.
 *
 * React Native has no form element or submit event. Form intentionally owns
 * only spacing; validation and submission stay with the caller's chosen state
 * library, and submit buttons invoke that library's handler directly.
 */
export function Form({ ref, style, ...viewProps }: FormProps) {
	return <View ref={ref} style={[styles.form, style]} {...viewProps} />;
}

const styles = StyleSheet.create((theme) => ({
	form: {
		alignSelf: "stretch",
		gap: theme.spacing(6),
	},
}));
