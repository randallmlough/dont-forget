import {
	Children,
	createContext,
	isValidElement,
	type ReactNode,
	type Ref,
	use,
	useMemo,
} from "react";
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

export function FieldSet({
	children,
	ref,
	style,
	...viewProps
}: FieldSetProps) {
	const items = Children.toArray(children);
	const [legend, description, ...fields] = items;
	const hasSummary =
		isValidElement(legend) &&
		legend.type === FieldLegend &&
		isValidElement(description) &&
		description.type === FieldDescription;

	return (
		<View ref={ref} style={[styles.fieldSet, style]} {...viewProps}>
			{hasSummary ? (
				<>
					<View style={styles.fieldSetSummary}>
						{legend}
						{description}
					</View>
					{fields}
				</>
			) : (
				items
			)}
		</View>
	);
}

export type FieldLegendProps = FieldTextProps & {
	variant?: "label" | "legend";
};

export function FieldLegend({
	ref,
	style,
	variant = "legend",
	...textProps
}: FieldLegendProps) {
	return (
		<Text
			accessibilityRole="header"
			ref={ref}
			style={[variant === "legend" ? styles.legend : styles.label, style]}
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

export type FieldLabelProps = LabelProps;

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
			style={[
				field.invalid ? styles.invalidText : undefined,
				field.disabled ? styles.mutedText : undefined,
				style,
			]}
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

export type FieldTitleProps = FieldTextProps;

export function FieldTitle({ ref, style, ...textProps }: FieldTitleProps) {
	const field = use(FieldContext);

	const title = (
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

	return field.orientation === "horizontal" ? (
		<View style={styles.horizontalLabel}>{title}</View>
	) : (
		title
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

export type FieldErrorItem = {
	message?: string;
};

export function FieldError({
	children,
	errors,
	ref,
	style,
	...textProps
}: FieldErrorProps & { errors?: (FieldErrorItem | undefined)[] }) {
	const messages = uniqueErrorMessages(errors);
	const content = hasContent(children)
		? children
		: messages.length === 1
			? messages[0]
			: messages.map((message, index) => (
					<Text key={message}>{`${index === 0 ? "" : "\n"}• ${message}`}</Text>
				));

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
			{children ? <Text style={styles.separatorText}>{children}</Text> : null}
		</View>
	);
}

function hasContent(value: ReactNode): boolean {
	return value !== undefined && value !== null && value !== "";
}

function uniqueErrorMessages(
	errors: (FieldErrorItem | undefined)[] | undefined,
) {
	if (!errors) return [];
	return [...new Set(errors.flatMap((error) => error?.message ?? []))];
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
	label: {
		color: theme.colors.foreground,
		...theme.typography.callout,
		fontWeight: theme.fontWeights.medium,
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
	mutedText: {
		color: theme.colors.mutedForeground,
	},
	invalidText: {
		color: theme.colors.destructive,
	},
	separator: {
		height: theme.spacing(5),
		alignItems: "center",
		justifyContent: "center",
	},
	separatorLine: {
		position: "absolute",
		left: 0,
		right: 0,
		height: theme.borders.hairline,
		backgroundColor: theme.colors.border,
	},
	separatorText: {
		paddingHorizontal: theme.spacing(2),
		backgroundColor: theme.colors.background,
		color: theme.colors.mutedForeground,
		...theme.typography.caption,
	},
}));
