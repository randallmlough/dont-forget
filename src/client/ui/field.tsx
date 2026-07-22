import { createContext, type Ref, use, useMemo } from "react";
import {
	type AccessibilityState,
	type StyleProp,
	Text,
	type TextProps,
	type TextStyle,
	View,
	type ViewProps,
	type ViewStyle,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";

type FieldContextValue = {
	disabled: boolean;
	invalid: boolean;
};

/** Consumed by form controls (TextField, InputGroup) to inherit Field state. */
export const FieldContext = createContext<FieldContextValue>({
	disabled: false,
	invalid: false,
});

type FieldViewProps = Omit<ViewProps, "style"> & {
	ref?: Ref<View>;
	style?: StyleProp<ViewStyle>;
};

type FieldTextProps = Omit<TextProps, "style"> & {
	ref?: Ref<Text>;
	style?: StyleProp<TextStyle>;
};

export type FieldProps = FieldViewProps & {
	disabled?: boolean;
	invalid?: boolean;
};

export function Field({
	accessibilityState,
	disabled = false,
	invalid = false,
	ref,
	style,
	...viewProps
}: FieldProps) {
	const contextValue = useMemo(
		() => ({ disabled, invalid }),
		[disabled, invalid],
	);
	const fieldAccessibilityState: AccessibilityState = {
		...accessibilityState,
		disabled,
	};

	return (
		<FieldContext value={contextValue}>
			<View
				accessibilityState={fieldAccessibilityState}
				ref={ref}
				style={[styles.field, disabled ? styles.disabled : undefined, style]}
				{...viewProps}
			/>
		</FieldContext>
	);
}

export type FieldLabelProps = FieldTextProps;

export function FieldLabel({ ref, style, ...textProps }: FieldLabelProps) {
	const field = use(FieldContext);

	return (
		<Text
			ref={ref}
			style={[
				styles.label,
				field.invalid ? styles.invalidText : undefined,
				field.disabled ? styles.mutedText : undefined,
				style,
			]}
			{...textProps}
		/>
	);
}

export type FieldDescriptionProps = FieldTextProps;

export function FieldDescription({
	ref,
	style,
	...textProps
}: FieldDescriptionProps) {
	return <Text ref={ref} style={[styles.description, style]} {...textProps} />;
}

export type FieldErrorProps = FieldTextProps;

export function FieldError({
	children,
	ref,
	style,
	...textProps
}: FieldErrorProps) {
	if (children === undefined || children === null || children === "") {
		return null;
	}

	return (
		<Text ref={ref} style={[styles.error, style]} {...textProps}>
			{children}
		</Text>
	);
}

const styles = StyleSheet.create((theme) => ({
	field: {
		alignSelf: "stretch",
		gap: theme.spacing(2),
	},
	disabled: {
		opacity: theme.opacities.disabled,
	},
	label: {
		color: theme.colors.foreground,
		...theme.typography.callout,
		fontWeight: theme.fontWeights.medium,
	},
	description: {
		color: theme.colors.mutedForeground,
		...theme.typography.caption,
	},
	error: {
		color: theme.colors.destructive,
		...theme.typography.caption,
	},
	mutedText: {
		color: theme.colors.mutedForeground,
	},
	invalidText: {
		color: theme.colors.destructive,
	},
}));
