import { createContext, type ReactNode, type Ref, use, useMemo } from "react";
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
import { Label, type LabelProps } from "./label";

type FieldContextValue = {
	disabled: boolean;
	invalid: boolean;
	orientation: "horizontal" | "vertical";
	required: boolean;
};

/** Consumed by labels and form controls to inherit Field state. */
export const FieldContext = createContext<FieldContextValue>({
	disabled: false,
	invalid: false,
	orientation: "vertical",
	required: false,
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
	orientation?: "horizontal" | "vertical";
	required?: boolean;
};

export function Field({
	accessibilityState,
	disabled = false,
	invalid = false,
	orientation = "vertical",
	ref,
	required = false,
	style,
	...viewProps
}: FieldProps) {
	const contextValue = useMemo(
		() => ({ disabled, invalid, orientation, required }),
		[disabled, invalid, orientation, required],
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

export type FieldSetProps = FieldViewProps;

export function FieldSet({ ref, style, ...viewProps }: FieldSetProps) {
	return <View ref={ref} style={[styles.fieldSet, style]} {...viewProps} />;
}

export type FieldSetSummaryProps = FieldViewProps;

/** Groups a FieldSet's legend and description tighter than its fields. */
export function FieldSetSummary({
	ref,
	style,
	...viewProps
}: FieldSetSummaryProps) {
	return (
		<View ref={ref} style={[styles.fieldSetSummary, style]} {...viewProps} />
	);
}

export type FieldLegendProps = FieldTextProps;

export function FieldLegend({ ref, style, ...textProps }: FieldLegendProps) {
	return (
		<Text
			accessibilityRole="header"
			ref={ref}
			style={[styles.legend, style]}
			{...textProps}
		/>
	);
}

export type FieldGroupProps = FieldViewProps;

export function FieldGroup({ ref, style, ...viewProps }: FieldGroupProps) {
	return <View ref={ref} style={[styles.fieldGroup, style]} {...viewProps} />;
}

export type FieldContentProps = FieldViewProps;

export function FieldContent({ ref, style, ...viewProps }: FieldContentProps) {
	return <View ref={ref} style={[styles.content, style]} {...viewProps} />;
}

// A disabled Field already dims all of its children, so FieldLabel adds no
// disabled treatment of its own.
export type FieldLabelProps = Omit<LabelProps, "disabled">;

export function FieldLabel({
	children,
	ref,
	style,
	...labelProps
}: FieldLabelProps) {
	const field = use(FieldContext);

	const label = (
		<Label
			ref={ref}
			style={[field.invalid ? styles.invalidText : undefined, style]}
			{...labelProps}
		>
			{children}
			{field.required ? <Text style={styles.required}> *</Text> : null}
		</Label>
	);

	return field.orientation === "horizontal" ? (
		<View style={styles.horizontalLabel}>{label}</View>
	) : (
		label
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

export type FieldErrorProps = FieldTextProps & {
	/** Duplicates collapse; multiple messages render as a bulleted list. */
	errors?: string[];
};

export function FieldError({
	children,
	errors,
	ref,
	style,
	...textProps
}: FieldErrorProps) {
	const messages = [...new Set(errors)];
	const content = hasContent(children)
		? children
		: messages.length === 1
			? messages[0]
			: messages.map((message) => `• ${message}`).join("\n");

	if (!hasContent(content)) {
		return null;
	}

	return (
		<Text
			accessibilityRole="alert"
			ref={ref}
			style={[styles.error, style]}
			{...textProps}
		>
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
		<View ref={ref} style={[styles.separator, style]} {...viewProps}>
			<View style={styles.separatorLine} />
			{children ? (
				<>
					<Text style={styles.separatorText}>{children}</Text>
					<View style={styles.separatorLine} />
				</>
			) : null}
		</View>
	);
}

function hasContent(value: ReactNode): boolean {
	return value !== undefined && value !== null && value !== "";
}

const styles = StyleSheet.create((theme) => ({
	fieldSet: {
		alignSelf: "stretch",
		gap: theme.spacing(6),
	},
	fieldSetSummary: {
		alignSelf: "stretch",
		gap: theme.spacing(2),
	},
	legend: {
		color: theme.colors.foreground,
		...theme.typography.body,
		fontWeight: theme.fontWeights.medium,
	},
	fieldGroup: {
		alignSelf: "stretch",
		gap: theme.spacing(7),
	},
	field: {
		alignSelf: "stretch",
		gap: theme.spacing(3),
	},
	horizontal: {
		flexDirection: "row",
		alignItems: "flex-start",
	},
	horizontalLabel: {
		minHeight: theme.spacing(11),
		justifyContent: "center",
	},
	disabled: {
		opacity: theme.opacities.disabled,
	},
	content: {
		flex: 1,
		gap: theme.spacing(1.5),
	},
	required: {
		color: theme.colors.destructive,
	},
	description: {
		color: theme.colors.mutedForeground,
		...theme.typography.caption,
	},
	error: {
		color: theme.colors.destructive,
		...theme.typography.caption,
	},
	invalidText: {
		color: theme.colors.destructive,
	},
	separator: {
		height: theme.spacing(5),
		flexDirection: "row",
		alignItems: "center",
	},
	separatorLine: {
		flex: 1,
		height: theme.borders.hairline,
		backgroundColor: theme.colors.border,
	},
	separatorText: {
		paddingHorizontal: theme.spacing(2),
		color: theme.colors.mutedForeground,
		...theme.typography.caption,
	},
}));
