import {
	createContext,
	type ReactNode,
	type Ref,
	use,
	useCallback,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	type AccessibilityState,
	Pressable,
	type StyleProp,
	Text,
	TextInput,
	type TextInputProps,
	type TextStyle,
	View,
	type ViewProps,
	type ViewStyle,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { FieldContext } from "./field";
import { forwardRefValue } from "./refs";

type InputOTPContextValue = {
	activeIndex: number | null;
	invalid: boolean;
	value: string;
};

const InputOTPContext = createContext<InputOTPContextValue | null>(null);

export type InputOTPProps = Omit<
	TextInputProps,
	| "children"
	| "defaultValue"
	| "editable"
	| "maxLength"
	| "onBlur"
	| "onChangeText"
	| "onFocus"
	| "style"
	| "value"
> & {
	children: ReactNode;
	containerStyle?: StyleProp<ViewStyle>;
	defaultValue?: string;
	disabled?: boolean;
	invalid?: boolean;
	maxLength: number;
	onBlur?: TextInputProps["onBlur"];
	onChangeText?: (value: string) => void;
	onComplete?: (value: string) => void;
	onFocus?: TextInputProps["onFocus"];
	/** Every entered character must match this expression. */
	pattern?: RegExp;
	ref?: Ref<TextInput>;
	value?: string;
};

/**
 * Composable one-time-code input with a single native TextInput.
 *
 * The real input stays visually hidden while slots mirror its value. Keeping
 * one input preserves paste, selection, keyboard, and iOS one-time-code
 * autofill behavior without coordinating multiple fields.
 */
export function InputOTP({
	accessibilityState,
	autoComplete = "one-time-code",
	children,
	containerStyle,
	defaultValue = "",
	disabled,
	invalid,
	keyboardType = "number-pad",
	maxLength,
	onBlur,
	onChangeText,
	onComplete,
	onFocus,
	pattern,
	ref,
	textContentType = "oneTimeCode",
	value,
	...inputProps
}: InputOTPProps) {
	const { theme } = useUnistyles();
	const field = use(FieldContext);
	const inputRef = useRef<TextInput | null>(null);
	const [focused, setFocused] = useState(false);
	const [internalValue, setInternalValue] = useState(() =>
		normalizeValue(defaultValue, maxLength, pattern),
	);
	const isDisabled = disabled ?? field.disabled;
	const isInvalid = invalid ?? field.invalid;
	// internalValue is normalized at every write; only the controlled prop
	// can arrive unnormalized.
	const currentValue =
		value === undefined
			? internalValue
			: normalizeValue(value, maxLength, pattern);
	const activeIndex = focused
		? Math.min(currentValue.length, maxLength - 1)
		: null;
	const inputAccessibilityState: AccessibilityState = {
		...accessibilityState,
		disabled: isDisabled,
	};
	const contextValue = useMemo<InputOTPContextValue>(
		() => ({
			activeIndex,
			invalid: isInvalid,
			value: currentValue,
		}),
		[activeIndex, currentValue, isInvalid],
	);

	function handleTextChange(nextValue: string) {
		const normalized = normalizeValue(nextValue, maxLength, pattern);
		if (value === undefined) setInternalValue(normalized);
		onChangeText?.(normalized);
		if (normalized.length === maxLength) onComplete?.(normalized);
	}

	function focusInput() {
		if (!isDisabled) inputRef.current?.focus();
	}

	const setInputRef = useCallback(
		(node: TextInput | null) => {
			inputRef.current = node;
			forwardRefValue(ref, node);
		},
		[ref],
	);

	return (
		<Pressable
			accessible={false}
			disabled={isDisabled}
			onPress={focusInput}
			style={[
				styles.container,
				isDisabled ? styles.disabled : undefined,
				containerStyle,
			]}
		>
			<InputOTPContext value={contextValue}>{children}</InputOTPContext>
			<TextInput
				accessibilityState={inputAccessibilityState}
				autoComplete={autoComplete}
				caretHidden
				editable={!isDisabled}
				keyboardType={keyboardType}
				maxLength={maxLength}
				onBlur={(event) => {
					setFocused(false);
					onBlur?.(event);
				}}
				onChangeText={handleTextChange}
				onFocus={(event) => {
					setFocused(true);
					onFocus?.(event);
				}}
				ref={setInputRef}
				selectionColor={
					isInvalid ? theme.colors.destructive : theme.colors.primary
				}
				style={styles.input}
				textContentType={textContentType}
				value={currentValue}
				{...inputProps}
			/>
		</Pressable>
	);
}

export type InputOTPGroupProps = Omit<ViewProps, "style"> & {
	style?: StyleProp<ViewStyle>;
};

export function InputOTPGroup({ style, ...viewProps }: InputOTPGroupProps) {
	return (
		<View
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
			style={[styles.group, style]}
			{...viewProps}
		/>
	);
}

export type InputOTPSlotProps = Omit<ViewProps, "style"> & {
	index: number;
	placeholder?: string;
	style?: StyleProp<ViewStyle>;
	textStyle?: StyleProp<TextStyle>;
};

export function InputOTPSlot({
	index,
	placeholder = "",
	style,
	textStyle,
	...viewProps
}: InputOTPSlotProps) {
	const context = useInputOTPContext();
	const valueCharacter = context.value[index];
	const character = valueCharacter ?? placeholder;
	const isActive = context.activeIndex === index;

	return (
		<View
			style={[
				styles.slot,
				valueCharacter ? styles.filledSlot : undefined,
				isActive ? styles.activeSlot : undefined,
				// Invalid wins over focus, matching createInputModifiers.
				context.invalid ? styles.invalidSlot : undefined,
				style,
			]}
			{...viewProps}
		>
			<Text style={[styles.slotText, textStyle]}>{character}</Text>
			{isActive && !character ? <View style={styles.caret} /> : null}
		</View>
	);
}

export type InputOTPSeparatorProps = Omit<ViewProps, "children" | "style"> & {
	children?: string;
	style?: StyleProp<ViewStyle>;
	textStyle?: StyleProp<TextStyle>;
};

export function InputOTPSeparator({
	children = "−",
	style,
	textStyle,
	...viewProps
}: InputOTPSeparatorProps) {
	return (
		<View
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
			style={[styles.separator, style]}
			{...viewProps}
		>
			<Text style={[styles.separatorText, textStyle]}>{children}</Text>
		</View>
	);
}

function useInputOTPContext() {
	const context = use(InputOTPContext);
	if (!context) {
		throw new Error("InputOTPSlot must be used within InputOTP");
	}
	return context;
}

function normalizeValue(value: string, maxLength: number, pattern?: RegExp) {
	const characters = pattern
		? Array.from(value).filter((character) => {
				pattern.lastIndex = 0;
				return pattern.test(character);
			})
		: Array.from(value);
	return characters.slice(0, maxLength).join("");
}

/** The theme has no focus-ring opacity token. */
const FOCUS_GLOW_OPACITY = 0.72;

const styles = StyleSheet.create((theme) => ({
	container: {
		alignSelf: "flex-start",
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(2),
	},
	disabled: {
		opacity: theme.opacities.disabled,
	},
	input: {
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		color: "transparent",
		backgroundColor: "transparent",
	},
	group: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(1),
	},
	slot: {
		width: theme.spacing(11),
		height: theme.spacing(11),
		alignItems: "center",
		justifyContent: "center",
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.input,
		borderRadius: theme.radii.md,
		backgroundColor: theme.colors.card,
	},
	filledSlot: {
		backgroundColor: theme.colors.muted,
	},
	invalidSlot: {
		borderColor: theme.colors.destructive,
		shadowColor: theme.colors.destructive,
	},
	activeSlot: {
		borderColor: theme.colors.primary,
		shadowColor: theme.colors.primary,
		shadowOffset: { width: 0, height: 0 },
		shadowOpacity: FOCUS_GLOW_OPACITY,
		shadowRadius: theme.spacing(1),
	},
	slotText: {
		color: theme.colors.foreground,
		...theme.typography.body,
		fontWeight: theme.fontWeights.semibold,
		fontVariant: ["tabular-nums"],
	},
	caret: {
		position: "absolute",
		width: theme.borders.thin,
		height: theme.spacing(5),
		backgroundColor: theme.colors.foreground,
	},
	separator: {
		minWidth: theme.spacing(3),
		alignItems: "center",
		justifyContent: "center",
	},
	separatorText: {
		color: theme.colors.mutedForeground,
		...theme.typography.body,
		fontWeight: theme.fontWeights.semibold,
	},
}));
