import { createContext, type ReactNode, type Ref, use } from "react";
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

export type FieldOrientation = "vertical" | "horizontal";

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
	orientation?: FieldOrientation;
};

export function Field({
	accessibilityState,
	disabled = false,
	invalid = false,
	orientation = "vertical",
	ref,
	style,
	...viewProps
}: FieldProps) {
	const fieldAccessibilityState: AccessibilityState = {
		...accessibilityState,
		disabled,
	};

	return (
		<FieldContext value={{ disabled, invalid }}>
			<View
				accessibilityState={fieldAccessibilityState}
				ref={ref}
				style={[
					styles.field,
					orientation === "horizontal" ? styles.horizontal : undefined,
					disabled ? styles.disabled : undefined,
					style,
				]}
				{...viewProps}
			/>
		</FieldContext>
	);
}

export type FieldGroupProps = FieldViewProps;

export function FieldGroup({ ref, style, ...viewProps }: FieldGroupProps) {
	return <View ref={ref} style={[styles.group, style]} {...viewProps} />;
}

export type FieldSetProps = FieldViewProps;

export function FieldSet({ ref, style, ...viewProps }: FieldSetProps) {
	return <View ref={ref} style={[styles.fieldSet, style]} {...viewProps} />;
}

export type FieldContentProps = FieldViewProps;

export function FieldContent({ ref, style, ...viewProps }: FieldContentProps) {
	return <View ref={ref} style={[styles.content, style]} {...viewProps} />;
}

export type FieldLabelProps = FieldTextProps & {
	disabled?: boolean;
	required?: boolean;
};

export function FieldLabel({
	children,
	disabled,
	ref,
	required = false,
	style,
	...textProps
}: FieldLabelProps) {
	const field = use(FieldContext);
	const isDisabled = disabled ?? field.disabled;

	return (
		<Text
			ref={ref}
			style={[
				styles.label,
				field.invalid ? styles.invalidText : undefined,
				isDisabled ? styles.mutedText : undefined,
				style,
			]}
			{...textProps}
		>
			{children}
			{required ? <Text style={styles.required}> *</Text> : null}
		</Text>
	);
}

export type FieldTitleProps = FieldTextProps;

export function FieldTitle({ ref, style, ...textProps }: FieldTitleProps) {
	const field = use(FieldContext);

	return (
		<Text
			ref={ref}
			style={[
				styles.title,
				field.invalid ? styles.invalidText : undefined,
				style,
			]}
			{...textProps}
		/>
	);
}

export type FieldLegendProps = FieldTextProps & {
	variant?: "legend" | "label";
};

export function FieldLegend({
	ref,
	style,
	variant = "legend",
	...textProps
}: FieldLegendProps) {
	return (
		<Text
			ref={ref}
			style={[variant === "label" ? styles.label : styles.legend, style]}
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

type FieldErrorLike = {
	message?: string;
};

export type FieldErrorProps = Omit<FieldTextProps, "children"> & {
	children?: ReactNode;
	errors?: readonly (FieldErrorLike | undefined)[];
};

export function FieldError({
	children,
	errors,
	ref,
	style,
	...textProps
}: FieldErrorProps) {
	const messages = Array.from(
		new Set(
			errors
				?.map((error) => error?.message)
				.filter((message): message is string => Boolean(message)) ?? [],
		),
	);
	const content = children ?? messages.join("\n");

	if (content === undefined || content === null || content === "") return null;

	return (
		<Text ref={ref} style={[styles.error, style]} {...textProps}>
			{content}
		</Text>
	);
}

export type FieldSeparatorProps = FieldViewProps & {
	children?: ReactNode;
};

export function FieldSeparator({
	children,
	ref,
	style,
	...viewProps
}: FieldSeparatorProps) {
	return (
		<View
			accessible={false}
			ref={ref}
			style={[styles.separator, style]}
			{...viewProps}
		>
			<View style={styles.separatorLine} />
			{children !== undefined && children !== null ? (
				<Text style={styles.separatorText}>{children}</Text>
			) : null}
			<View style={styles.separatorLine} />
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	field: {
		alignSelf: "stretch",
		gap: theme.spacing(2),
	},
	horizontal: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
	},
	disabled: {
		opacity: theme.opacities.disabled,
	},
	group: {
		alignSelf: "stretch",
		gap: theme.spacing(6),
	},
	fieldSet: {
		alignSelf: "stretch",
		gap: theme.spacing(3),
	},
	content: {
		flex: 1,
		minWidth: 0,
		gap: theme.spacing(1),
	},
	label: {
		color: theme.colors.foreground,
		...theme.typography.callout,
		fontWeight: theme.fontWeights.medium,
	},
	title: {
		color: theme.colors.foreground,
		...theme.typography.callout,
		fontWeight: theme.fontWeights.medium,
	},
	legend: {
		color: theme.colors.foreground,
		...theme.typography.headline,
	},
	description: {
		color: theme.colors.mutedForeground,
		...theme.typography.caption,
	},
	error: {
		color: theme.colors.destructive,
		...theme.typography.caption,
	},
	required: {
		color: theme.colors.destructive,
	},
	mutedText: {
		color: theme.colors.mutedForeground,
	},
	invalidText: {
		color: theme.colors.destructive,
	},
	separator: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
	},
	separatorLine: {
		flex: 1,
		height: theme.borders.hairline,
		backgroundColor: theme.colors.border,
	},
	separatorText: {
		color: theme.colors.mutedForeground,
		...theme.typography.caption,
	},
}));
