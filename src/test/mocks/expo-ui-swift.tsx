import { Children, isValidElement, type ReactNode, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	Text as ReactNativeText,
	TextInput,
	View,
} from "react-native";

type MockModifier = {
	$type: string;
	disabled?: boolean;
	eventListener?: () => void;
	hint?: string;
	label?: string;
	tag?: string | number;
	value?: string;
};

type MockContainerProps = {
	children?: ReactNode;
	colorScheme?: "light" | "dark";
	style?: object;
	testID?: string;
};

type MockTextFieldProps = {
	autoFocus?: boolean;
	axis?: "horizontal" | "vertical";
	/** Slot children: a `<TextField.Placeholder>` / `<SecureField.Placeholder>`. */
	children?: ReactNode;
	modifiers?: MockModifier[];
	onFocusChange?: (focused: boolean) => void;
	onTextChange?: (value: string) => void;
	placeholder?: string;
	text?: MockObservableState<string>;
};

type MockButtonProps = {
	children?: ReactNode;
	label?: string;
	modifiers?: MockModifier[];
	onPress?: () => void;
};

type MockMenuProps = {
	children?: ReactNode;
	label: ReactNode;
	modifiers?: MockModifier[];
};

type MockPickerProps = {
	children?: ReactNode;
	label?: ReactNode;
	modifiers?: MockModifier[];
	onSelectionChange?: (selection: string) => void;
	selection?: string;
};

type MockPickerOptionProps = {
	children?: ReactNode;
	modifiers?: MockModifier[];
};

type MockObservableState<T> = {
	value: T;
	get: () => T;
	set: (next: T) => void;
};

export function Host({
	children,
	colorScheme,
	style,
	testID,
}: MockContainerProps) {
	return (
		<View
			accessibilityValue={{ text: colorScheme }}
			style={style}
			testID={testID ?? "expo-ui-host"}
		>
			{children}
		</View>
	);
}

export function VStack({ children }: MockContainerProps) {
	return <View>{children}</View>;
}

export function HStack({ children }: MockContainerProps) {
	return <View>{children}</View>;
}

export function GlassEffectContainer({ children }: MockContainerProps) {
	return <View>{children}</View>;
}

export function Spacer() {
	return <View />;
}

export function ProgressView() {
	return <ActivityIndicator />;
}

export function Image({ systemName }: { systemName?: string }) {
	return (
		<ReactNativeText accessibilityElementsHidden>{systemName}</ReactNativeText>
	);
}

export function Text({
	children,
	modifiers,
}: MockContainerProps & {
	modifiers?: MockModifier[];
}) {
	return (
		<ReactNativeText accessibilityLabel={modifierLabel(modifiers)}>
			{children}
		</ReactNativeText>
	);
}

export function TextField({
	autoFocus,
	axis,
	children,
	modifiers,
	onFocusChange,
	onTextChange,
	placeholder,
	text,
}: MockTextFieldProps) {
	return (
		<TextInput
			accessibilityLabel={modifierLabel(modifiers)}
			autoFocus={autoFocus}
			multiline={axis === "vertical"}
			onBlur={() => onFocusChange?.(false)}
			onChangeText={(value) => {
				text?.set(value);
				onTextChange?.(value);
			}}
			onFocus={() => onFocusChange?.(true)}
			onSubmitEditing={modifier(modifiers, "onSubmit")?.eventListener}
			placeholder={placeholder ?? textContent(children)}
			value={text?.get()}
		/>
	);
}
TextField.Placeholder = PlaceholderSlot;

export function SecureField({
	autoFocus,
	children,
	modifiers,
	onFocusChange,
	onTextChange,
	placeholder,
	text,
}: Omit<MockTextFieldProps, "axis">) {
	return (
		<TextInput
			accessibilityLabel={modifierLabel(modifiers)}
			autoFocus={autoFocus}
			onBlur={() => onFocusChange?.(false)}
			onChangeText={(value) => {
				text?.set(value);
				onTextChange?.(value);
			}}
			onFocus={() => onFocusChange?.(true)}
			placeholder={placeholder ?? textContent(children)}
			secureTextEntry
			value={text?.get()}
		/>
	);
}
SecureField.Placeholder = PlaceholderSlot;

/**
 * Placeholder slot metadata: the field mock extracts its text via
 * `textContent` instead of rendering it, matching how the native component
 * shows placeholder text inside the field.
 */
function PlaceholderSlot(_props: { children?: ReactNode }) {
	return null;
}

/** Digs the first string out of a slot-children tree. */
function textContent(node: ReactNode): string | undefined {
	if (typeof node === "string") return node;
	if (Array.isArray(node)) {
		for (const child of node) {
			const text = textContent(child);
			if (text !== undefined) return text;
		}
		return undefined;
	}
	if (isValidElement<{ children?: ReactNode }>(node)) {
		return textContent(node.props.children);
	}
	return undefined;
}

export function Button({
	children,
	label,
	modifiers,
	onPress,
}: MockButtonProps) {
	const isDisabled = modifier(modifiers, "disabled")?.disabled ?? false;
	return (
		<Pressable
			accessibilityHint={modifierHint(modifiers)}
			accessibilityLabel={modifierLabel(modifiers) ?? label}
			accessibilityRole="button"
			accessibilityState={{ disabled: isDisabled }}
			accessibilityValue={modifierValue(modifiers)}
			disabled={isDisabled}
			onPress={onPress}
		>
			{children ?? <ReactNativeText>{label}</ReactNativeText>}
		</Pressable>
	);
}

export function Menu({ children, label, modifiers }: MockMenuProps) {
	const [isOpen, setIsOpen] = useState(false);
	const isDisabled = modifier(modifiers, "disabled")?.disabled ?? false;
	const textLabel = typeof label === "string" ? label : undefined;

	return (
		<View>
			<Pressable
				accessibilityLabel={modifierLabel(modifiers) ?? textLabel}
				accessibilityRole="button"
				accessibilityState={{ disabled: isDisabled, expanded: isOpen }}
				disabled={isDisabled}
				onPress={() => setIsOpen(true)}
			>
				{typeof label === "string" ? (
					<ReactNativeText>{label}</ReactNativeText>
				) : (
					label
				)}
			</Pressable>
			{isOpen ? children : null}
		</View>
	);
}

export function Picker({
	children,
	label,
	modifiers,
	onSelectionChange,
	selection,
}: MockPickerProps) {
	const isDisabled = modifier(modifiers, "disabled")?.disabled ?? false;
	return (
		<View
			accessibilityLabel={modifierLabel(modifiers)}
			accessibilityRole="button"
			accessibilityState={{ disabled: isDisabled }}
			accessibilityValue={{ text: selection }}
		>
			{label}
			{Children.map(children, (child) => {
				if (!isValidElement<MockPickerOptionProps>(child)) return null;
				const optionTag = modifier(child.props.modifiers, "tag")?.tag;
				if (typeof optionTag !== "string") return null;
				const optionLabel =
					typeof child.props.children === "string"
						? child.props.children
						: optionTag;
				return (
					<Pressable
						accessibilityLabel={`Select List: ${optionLabel}`}
						accessibilityRole="menuitem"
						disabled={isDisabled}
						onPress={() => onSelectionChange?.(optionTag)}
					>
						<ReactNativeText>{optionLabel}</ReactNativeText>
					</Pressable>
				);
			})}
		</View>
	);
}

export function useNativeState<T>(initialValue: T): MockObservableState<T> {
	const [state] = useState<MockObservableState<T>>(() => {
		return {
			value: initialValue,
			get() {
				return this.value;
			},
			set(next) {
				this.value = next;
			},
		};
	});
	return state;
}

function modifierLabel(
	modifiers: MockModifier[] | undefined,
): string | undefined {
	return modifier(modifiers, "accessibilityLabel")?.label;
}

function modifierHint(
	modifiers: MockModifier[] | undefined,
): string | undefined {
	return modifier(modifiers, "accessibilityHint")?.hint;
}

function modifierValue(
	modifiers: MockModifier[] | undefined,
): { text: string } | undefined {
	const value = modifier(modifiers, "accessibilityValue")?.value;
	return value ? { text: value } : undefined;
}

function modifier(
	modifiers: MockModifier[] | undefined,
	type: string,
): MockModifier | undefined {
	return modifiers?.find((candidate) => candidate.$type === type);
}
