import {
	Host,
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
	autocorrectionDisabled,
	background,
	disabled as disabledModifier,
	font,
	foregroundStyle,
	frame,
	keyboardType,
	opacity,
	padding,
	shapes,
	textContentType,
	textFieldStyle,
	textInputAutocapitalization,
	tint,
	type ViewModifier,
} from "@expo/ui/swift-ui/modifiers";
import { createContext, type ReactNode, type Ref, use, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { nativeColorScheme } from "@/client/theme/native-color-scheme";
import type { AppTheme } from "@/client/theme/theme-contract";
import { FieldContext } from "./field";

// SwiftUI fields hug their content; an effectively-unbounded maxWidth makes
// them fill the available width instead.
export const FILL_AVAILABLE_WIDTH = Infinity;

/** The focusable subset shared by SwiftUI TextField and SecureField refs. */
export type FocusableInputRef = Pick<TextFieldRef, "blur" | "focus">;

export type InputGroupContextValue = {
	disabled: boolean;
	invalid: boolean;
	/** Registers the input's native ref so the group can forward focus taps. */
	onInputRef: (node: FocusableInputRef | null) => void;
	onInputFocusChange: (focused: boolean) => void;
};

/**
 * Provided by InputGroup (input-group.tsx); consumed here so Input renders
 * bare inside a group. Living beside Input keeps the import one-directional.
 */
export const InputGroupContext = createContext<InputGroupContextValue | null>(
	null,
);

export type InputKind = keyof typeof KIND_MODIFIERS;

/**
 * Behavioral modifiers per semantic input kind: keyboard, iOS autofill
 * content type, and capitalization/autocorrect config. Applied outside the
 * user-modifier override filter so custom chrome can never drop them.
 */
const KIND_MODIFIERS = {
	cardNumber: [keyboardType("numeric"), textContentType("creditCardNumber")],
	email: [
		keyboardType("email-address"),
		textContentType("emailAddress"),
		textInputAutocapitalization("never"),
		autocorrectionDisabled(),
	],
	oneTimeCode: [keyboardType("numeric"), textContentType("oneTimeCode")],
	phone: [keyboardType("phone-pad"), textContentType("telephoneNumber")],
	url: [
		keyboardType("url"),
		textContentType("URL"),
		textInputAutocapitalization("never"),
		autocorrectionDisabled(),
	],
} satisfies Record<string, ViewModifier[]>;

type InputBaseProps = Omit<
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
	/** Initial text for an uncontrolled input; ignored when `text` is provided. */
	defaultValue?: string;
	/** Defaults to the surrounding InputGroup's or Field's disabled state. */
	disabled?: boolean;
	/** Defaults to the surrounding InputGroup's or Field's invalid state. */
	invalid?: boolean;
	/**
	 * Semantic input kind: applies the matching keyboard, iOS autofill content
	 * type, and capitalization/autocorrect configuration.
	 */
	kind?: InputKind;
	/**
	 * Additional SwiftUI modifiers, applied after app styling. A user modifier
	 * takes ownership of its `$type`: app styling of the same type is dropped,
	 * so e.g. a custom `background` replaces the chrome instead of wrapping it.
	 */
	modifiers?: ViewModifier[];
	placeholder?: string;
	/** Styles the standalone Host; unused when rendered inside an InputGroup. */
	style?: StyleProp<ViewStyle>;
};

export type InputProps = InputBaseProps &
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
 * App-owned input built on Expo UI's SwiftUI TextField.
 *
 * Controlled use passes a `text` state created with `useNativeState`;
 * uncontrolled use passes `defaultValue` and reads `onTextChange`. A plain
 * string value prop is deliberately unsupported: JS-thread writes to native
 * state are asynchronous, so a string round-trip can clobber fast typing.
 *
 * Standalone it wraps itself in a Host; inside an InputGroup it renders the
 * bare SwiftUI field and the group owns the Host and chrome.
 */
export function Input(props: InputProps) {
	const {
		accessibilityLabel,
		defaultValue = "",
		disabled,
		invalid,
		kind,
		modifiers,
		onFocusChange,
		placeholder,
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
		// Only the standalone chrome reads `focused`; inside a group the group
		// tracks focus itself, so skip the state write to avoid a no-op re-render.
		if (!group) setFocused(nextFocused);
		group?.onInputFocusChange(nextFocused);
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
			: createInputChromeModifiers({
					disabled: isDisabled,
					focused,
					invalid: isInvalid,
					theme,
				})),
	];

	const inputModifiers: ViewModifier[] = [
		...(accessibilityLabel
			? [accessibilityLabelModifier(accessibilityLabel)]
			: []),
		...omitUserOverridden(styleModifiers, modifiers),
		...(modifiers ?? []),
		...(kind ? KIND_MODIFIERS[kind] : []),
		disabledModifier(isDisabled),
		// Dim only for the input's own disabled prop; a disabled Field or
		// InputGroup already dims all of its children.
		opacity(disabled ? theme.opacities.disabled : 1),
	];

	const placeholderText =
		placeholder !== undefined ? (
			<SwiftUIText
				modifiers={[
					font({ textStyle: "body" }),
					foregroundStyle(theme.colors.mutedForeground),
				]}
			>
				{placeholder}
			</SwiftUIText>
		) : null;

	let inputElement: ReactNode;
	if (props.secureTextEntry) {
		const { autoFocus, maxLength, onTextChange, ref, testID } = props;
		inputElement = (
			<SecureField
				autoFocus={autoFocus}
				maxLength={maxLength}
				modifiers={inputModifiers}
				onFocusChange={handleFocusChange}
				onTextChange={onTextChange}
				ref={group ? (node) => registerGroupInput(group, ref, node) : ref}
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
		inputElement = (
			<SwiftUITextField
				autoFocus={autoFocus}
				axis={axis}
				maxLength={maxLength}
				modifiers={inputModifiers}
				onFocusChange={handleFocusChange}
				onSelectionChange={onSelectionChange}
				onTextChange={onTextChange}
				ref={group ? (node) => registerGroupInput(group, ref, node) : ref}
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

	if (group) return inputElement;

	return (
		<Host
			colorScheme={nativeColorScheme(rt.themeName)}
			matchContents={{ vertical: true }}
			style={[styles.host, style]}
		>
			{inputElement}
		</Host>
	);
}

/** Forwards a commit-time node to the consumer's callback or object ref. */
export function forwardRefValue<Node>(
	ref: Ref<Node> | undefined,
	node: Node | null,
) {
	if (typeof ref === "function") ref(node);
	else if (ref) ref.current = node;
}

/**
 * Registers the commit-time node with the surrounding group (for
 * tap-to-focus) while still forwarding it to the consumer's ref.
 */
function registerGroupInput<Node extends FocusableInputRef>(
	group: InputGroupContextValue,
	ref: Ref<Node> | undefined,
	node: Node | null,
) {
	group.onInputRef(node);
	forwardRefValue(ref, node);
}

/**
 * SwiftUI's border modifier is rectangular, so the chrome fakes a rounded
 * border with a border-color layer behind an inset fill layer. Shared with
 * InputGroup, which applies it to the group HStack instead of the input.
 */
export function createInputChromeModifiers({
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
 * functional props (disabled, gestures) must always apply. Shared with
 * InputGroup, whose modifiers prop overrides the group chrome the same way.
 */
export function omitUserOverridden(
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
