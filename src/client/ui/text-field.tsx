import {
	Host,
	HStack,
	SecureField,
	type SecureFieldRef,
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
	onTapGesture,
	opacity,
	padding,
	shapes,
	textFieldStyle,
	tint,
	type ViewModifier,
} from "@expo/ui/swift-ui/modifiers";
import {
	createContext,
	type ReactNode,
	type Ref,
	use,
	useMemo,
	useRef,
	useState,
} from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { nativeColorScheme } from "@/client/theme/native-color-scheme";
import type { AppTheme } from "@/client/theme/theme-contract";
import { FieldContext } from "./field";

const FILL_AVAILABLE_WIDTH = Infinity;

type InputGroupFieldRef = Pick<TextFieldRef, "blur" | "focus">;

type InputGroupContextValue = {
	disabled: boolean;
	invalid: boolean;
	/** Registers the field's native ref so the group can forward focus taps. */
	onFieldRef: (node: InputGroupFieldRef | null) => void;
	onFieldFocusChange: (focused: boolean) => void;
};

const InputGroupContext = createContext<InputGroupContextValue | null>(null);

type TextFieldBaseProps = Omit<
	SwiftUITextFieldProps,
	| "axis"
	| "children"
	| "modifiers"
	| "onSelectionChange"
	| "placeholder"
	| "ref"
	| "selection"
> & {
	accessibilityLabel?: string;
	/** Initial text for an uncontrolled field; ignored when `text` is provided. */
	defaultValue?: string;
	/** Defaults to the surrounding InputGroup's or Field's disabled state. */
	disabled?: boolean;
	/** Defaults to the surrounding InputGroup's or Field's invalid state. */
	invalid?: boolean;
	/**
	 * Additional SwiftUI modifiers, applied after app styling. A user modifier
	 * takes ownership of its `$type`: app styling of the same type is dropped,
	 * so e.g. a custom `background` replaces the chrome instead of wrapping it.
	 */
	modifiers?: ViewModifier[];
	placeholder?: string;
	/** Additional SwiftUI modifiers for the placeholder text. */
	placeholderModifiers?: ViewModifier[];
	/** Styles the standalone Host; unused when rendered inside an InputGroup. */
	style?: StyleProp<ViewStyle>;
};

export type TextFieldProps = TextFieldBaseProps &
	(
		| {
				/** Renders a SwiftUI `SecureField`; selection and multiline do not apply. */
				secureTextEntry: true;
				ref?: Ref<SecureFieldRef>;
		  }
		| {
				secureTextEntry?: false;
				axis?: SwiftUITextFieldProps["axis"];
				onSelectionChange?: SwiftUITextFieldProps["onSelectionChange"];
				ref?: Ref<TextFieldRef>;
				/** Native state for synchronous worklet-driven selection changes. */
				selection?: SwiftUITextFieldProps["selection"];
		  }
	);

/**
 * Experimental app-owned wrapper around Expo UI's SwiftUI TextField.
 *
 * Controlled use passes a `text` state created with `useNativeState`;
 * uncontrolled use passes `defaultValue` and reads `onTextChange`. A plain
 * string value prop is deliberately unsupported: JS-thread writes to native
 * state are asynchronous, so a string round-trip can clobber fast typing.
 *
 * Standalone it wraps itself in a Host; inside an InputGroup it renders the
 * bare SwiftUI field and the group owns the Host and chrome.
 */
export function TextField(props: TextFieldProps) {
	const {
		accessibilityLabel,
		defaultValue = "",
		disabled,
		invalid,
		modifiers,
		onFocusChange,
		placeholder,
		placeholderModifiers,
		style,
		text,
	} = props;
	const { rt, theme } = useUnistyles();
	const field = use(FieldContext);
	const group = use(InputGroupContext);
	const [focused, setFocused] = useState(false);
	const internalText = useNativeState(defaultValue);
	const textState = text ?? internalText;
	const isDisabled = disabled ?? (group ? group.disabled : field.disabled);
	const isInvalid = invalid ?? (group ? group.invalid : field.invalid);

	function handleFocusChange(nextFocused: boolean) {
		setFocused(nextFocused);
		group?.onFieldFocusChange(nextFocused);
		onFocusChange?.(nextFocused);
	}

	const styleModifiers: ViewModifier[] = [
		font({ textStyle: "body" }),
		foregroundStyle(theme.colors.foreground),
		tint(isInvalid ? theme.colors.destructive : theme.colors.primary),
		frame({
			minHeight: theme.spacing(11),
			maxWidth: FILL_AVAILABLE_WIDTH,
			alignment: "leading",
		}),
		textFieldStyle("plain"),
		...(group
			? []
			: createChromeModifiers({
					disabled: isDisabled,
					focused,
					invalid: isInvalid,
					theme,
				})),
	];

	const fieldModifiers: ViewModifier[] = [
		...(accessibilityLabel
			? [accessibilityLabelModifier(accessibilityLabel)]
			: []),
		...omitUserOverridden(styleModifiers, modifiers),
		...(modifiers ?? []),
		disabledModifier(isDisabled),
		// Dim only for the field's own disabled prop; a disabled Field or
		// InputGroup already dims all of its children.
		opacity(disabled ? theme.opacities.disabled : 1),
	];

	const placeholderText =
		placeholder !== undefined ? (
			<SwiftUIText
				modifiers={[
					font({ textStyle: "body" }),
					foregroundStyle(theme.colors.mutedForeground),
					...(placeholderModifiers ?? []),
				]}
			>
				{placeholder}
			</SwiftUIText>
		) : null;

	let fieldElement: ReactNode;
	if (props.secureTextEntry) {
		const { autoFocus, maxLength, onTextChange, ref, testID } = props;
		fieldElement = (
			<SecureField
				autoFocus={autoFocus}
				maxLength={maxLength}
				modifiers={fieldModifiers}
				onFocusChange={handleFocusChange}
				onTextChange={onTextChange}
				ref={
					group
						? (node) => {
								group.onFieldRef(node);
								forwardRefValue(ref, node);
							}
						: ref
				}
				testID={testID}
				text={textState}
			>
				{placeholderText ? (
					<SecureField.Placeholder>{placeholderText}</SecureField.Placeholder>
				) : null}
			</SecureField>
		);
	} else {
		const {
			autoFocus,
			axis,
			maxLength,
			onSelectionChange,
			onTextChange,
			ref,
			selection,
			testID,
		} = props;
		fieldElement = (
			<SwiftUITextField
				autoFocus={autoFocus}
				axis={axis}
				maxLength={maxLength}
				modifiers={fieldModifiers}
				onFocusChange={handleFocusChange}
				onSelectionChange={onSelectionChange}
				onTextChange={onTextChange}
				ref={
					group
						? (node) => {
								group.onFieldRef(node);
								forwardRefValue(ref, node);
							}
						: ref
				}
				selection={selection}
				testID={testID}
				text={textState}
			>
				{placeholderText ? (
					<SwiftUITextField.Placeholder>
						{placeholderText}
					</SwiftUITextField.Placeholder>
				) : null}
			</SwiftUITextField>
		);
	}

	if (group) return fieldElement;

	return (
		<Host
			colorScheme={nativeColorScheme(rt.themeName)}
			matchContents={{ vertical: true }}
			style={[styles.host, style]}
		>
			{fieldElement}
		</Host>
	);
}

export type InputGroupProps = {
	/** SwiftUI children: addons (Image, Button, …) and one TextField, in order. */
	children: ReactNode;
	/** Defaults to the surrounding Field's disabled state. */
	disabled?: boolean;
	/** Defaults to the surrounding Field's invalid state. */
	invalid?: boolean;
	style?: StyleProp<ViewStyle>;
};

/**
 * shadcn-style input group: a Host-level HStack that owns the field chrome so
 * SwiftUI addons (SF Symbol Images, Buttons) sit inside the bordered surface.
 * The TextField child detects the group via context and renders bare.
 */
export function InputGroup({
	children,
	disabled,
	invalid,
	style,
}: InputGroupProps) {
	const { rt, theme } = useUnistyles();
	const field = use(FieldContext);
	const [fieldFocused, setFieldFocused] = useState(false);
	const fieldRef = useRef<InputGroupFieldRef | null>(null);
	const isDisabled = disabled ?? field.disabled;
	const isInvalid = invalid ?? field.invalid;

	const contextValue = useMemo<InputGroupContextValue>(
		() => ({
			disabled: isDisabled,
			invalid: isInvalid,
			onFieldRef: (node) => {
				fieldRef.current = node;
			},
			onFieldFocusChange: setFieldFocused,
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
					...createChromeModifiers({
						disabled: isDisabled,
						focused: fieldFocused,
						invalid: isInvalid,
						theme,
					}),
					// onTapGesture stores this closure as a native event listener that
					// runs on tap, not during render, so the ref read is commit-safe.
					// eslint-disable-next-line react-hooks/refs
					onTapGesture(() => {
						void fieldRef.current?.focus();
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

/** Forwards a commit-time node to the consumer's callback or object ref. */
function forwardRefValue<FieldRef>(
	ref: Ref<FieldRef> | undefined,
	node: FieldRef | null,
) {
	if (typeof ref === "function") ref(node);
	else if (ref) ref.current = node;
}

/**
 * SwiftUI's border modifier is rectangular, so the chrome fakes a rounded
 * border with a border-color layer behind an inset fill layer.
 */
function createChromeModifiers({
	disabled,
	focused,
	invalid,
	theme,
}: {
	disabled: boolean;
	focused: boolean;
	invalid: boolean;
	theme: AppTheme;
}): ViewModifier[] {
	const borderColor = invalid
		? theme.colors.destructive
		: focused
			? theme.colors.primary
			: theme.colors.input;

	return [
		padding({ horizontal: theme.spacing(3) }),
		background(
			disabled ? theme.colors.muted : theme.colors.card,
			shapes.roundedRectangle({
				cornerRadius: theme.radii.md - theme.borders.thin,
			}),
		),
		padding({ all: theme.borders.thin }),
		background(
			borderColor,
			shapes.roundedRectangle({ cornerRadius: theme.radii.md }),
		),
	];
}

/**
 * A user modifier takes ownership of its `$type`: app styling of that type is
 * dropped so the escape hatch replaces styling instead of wrapping it. Only
 * style-derived modifiers go through this filter — modifiers backing
 * functional props (disabled, gestures) must always apply.
 */
function omitUserOverridden(
	derived: ViewModifier[],
	userModifiers: ViewModifier[] | undefined,
): ViewModifier[] {
	if (!userModifiers?.length) return derived;
	const userTypes = new Set(userModifiers.map((modifier) => modifier.$type));
	return derived.filter((modifier) => !userTypes.has(modifier.$type));
}

const styles = StyleSheet.create({
	host: {
		width: "100%",
	},
});
