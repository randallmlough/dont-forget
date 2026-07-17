import { type ReactNode, useState } from "react";
import {
	Pressable,
	Text as ReactNativeText,
	TextInput,
	View,
} from "react-native";

type MockModifier = {
	$type: string;
	disabled?: boolean;
	eventListener?: () => void;
	label?: string;
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
			placeholder={placeholder}
			value={text?.get()}
		/>
	);
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
			accessibilityLabel={modifierLabel(modifiers) ?? label}
			accessibilityRole="button"
			accessibilityState={{ disabled: isDisabled }}
			disabled={isDisabled}
			onPress={onPress}
		>
			{children ?? <ReactNativeText>{label}</ReactNativeText>}
		</Pressable>
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

function modifier(
	modifiers: MockModifier[] | undefined,
	type: string,
): MockModifier | undefined {
	return modifiers?.find((candidate) => candidate.$type === type);
}
