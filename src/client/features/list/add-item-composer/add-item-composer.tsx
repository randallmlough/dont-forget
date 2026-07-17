import {
	Button,
	GlassEffectContainer,
	Host,
	HStack,
	Spacer,
	Text,
	TextField,
	useNativeState,
	VStack,
} from "@expo/ui/swift-ui";
import {
	accessibilityLabel,
	buttonBorderShape,
	buttonStyle,
	controlSize,
	disabled,
	font,
	foregroundStyle,
	frame,
	glassEffect,
	lineLimit,
	onSubmit,
	padding,
	submitLabel,
	textFieldStyle,
	textInputAutocapitalization,
	tint,
} from "@expo/ui/swift-ui/modifiers";
import { useEffect, useState } from "react";
import { Keyboard, Pressable, View } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const ENTRY_BOTTOM_GAP = 12;
const TRAY_KEYBOARD_GAP = 6;
// SwiftUI fields hug their content; an effectively-unbounded maxWidth makes
// them fill the available width instead.
const FILL_AVAILABLE_WIDTH = Infinity;
export const ADD_ITEM_COMPOSER_SCROLL_CLEARANCE = 128;

export type AddItemComposerProps = {
	draft: AddItemComposerDraft;
	ui: AddItemComposerUiState;
	actions: AddItemComposerActions;
};

export type AddItemComposerDraft = {
	name: string;
	quantity: string;
	notes: string;
};

export type AddItemComposerUiState = {
	isOpen: boolean;
	isNoteOpen: boolean;
	canSubmit: boolean;
	listName: string;
	errorMessage: string | null;
};

export type AddItemComposerActions = {
	open: () => void;
	dismiss: () => void;
	submit: () => void;
	changeName: (value: string) => void;
	changeQuantity: (value: string) => void;
	changeNotes: (value: string) => void;
	toggleNote: () => void;
};

export function AddItemComposer({ draft, ui, actions }: AddItemComposerProps) {
	const insets = useSafeAreaInsets();
	const { rt } = useUnistyles();
	const colorScheme = rt.themeName === "dark" ? "dark" : "light";
	const visibility = useSharedValue(0);
	const keyboardHeight = useKeyboardHeight();

	useEffect(() => {
		visibility.set(
			withTiming(ui.isOpen ? 1 : 0, {
				duration: 160,
				easing: Easing.out(Easing.cubic),
			}),
		);
	}, [ui.isOpen, visibility]);

	const animatedStyle = useAnimatedStyle(() => {
		const currentVisibility = visibility.get();

		return {
			opacity: currentVisibility,
			transform: [{ translateY: (1 - currentVisibility) * 10 }],
		};
	});

	function dismissComposer() {
		Keyboard.dismiss();
		actions.dismiss();
	}

	if (!ui.isOpen) {
		return (
			<View
				collapsable={false}
				style={[
					styles.entryContainer,
					{ paddingBottom: insets.bottom + ENTRY_BOTTOM_GAP },
				]}
			>
				<RestingGlassComposer
					colorScheme={colorScheme}
					name={draft.name}
					actions={actions}
				/>
			</View>
		);
	}

	return (
		<View
			accessibilityLabel="Add Item composer"
			accessibilityViewIsModal
			pointerEvents="box-none"
			style={styles.overlay}
		>
			<Pressable
				accessibilityLabel="Dismiss add Item composer"
				accessibilityRole="button"
				onPress={dismissComposer}
				style={styles.dismissLayer}
			/>
			<Animated.View
				style={[
					styles.composerHost,
					animatedStyle,
					{
						bottom: Math.max(keyboardHeight, insets.bottom) + TRAY_KEYBOARD_GAP,
					},
				]}
			>
				<ExpandedGlassComposer
					colorScheme={colorScheme}
					draft={draft}
					ui={ui}
					actions={actions}
				/>
			</Animated.View>
		</View>
	);
}

function RestingGlassComposer({
	colorScheme,
	name: nameValue,
	actions,
}: {
	colorScheme: "light" | "dark";
	name: string;
	actions: AddItemComposerActions;
}) {
	const { theme } = useUnistyles();
	const name = useNativeState(nameValue);

	return (
		<Host colorScheme={colorScheme} style={styles.entryHost}>
			<GlassEffectContainer spacing={theme.spacing(3)}>
				<TextField
					placeholder="Add an Item…"
					text={name}
					onTextChange={actions.changeName}
					onFocusChange={(focused) => {
						if (focused) actions.open();
					}}
					modifiers={[
						accessibilityLabel("Add Item"),
						textFieldStyle("plain"),
						textInputAutocapitalization("sentences"),
						font({ textStyle: "body" }),
						foregroundStyle(theme.colors.text),
						frame({
							minHeight: theme.spacing(13),
							maxWidth: FILL_AVAILABLE_WIDTH,
						}),
						padding({ horizontal: theme.spacing(4) }),
						glassEffect({
							glass: { variant: "regular", interactive: true },
							shape: "capsule",
						}),
					]}
				/>
			</GlassEffectContainer>
		</Host>
	);
}

function ExpandedGlassComposer({
	colorScheme,
	draft,
	ui,
	actions,
}: {
	colorScheme: "light" | "dark";
	draft: AddItemComposerDraft;
	ui: AddItemComposerUiState;
	actions: AddItemComposerActions;
}) {
	const { theme } = useUnistyles();
	const name = useNativeState(draft.name);
	const quantity = useNativeState(draft.quantity);
	const notes = useNativeState(draft.notes);

	return (
		<Host
			colorScheme={colorScheme}
			matchContents={{ vertical: true }}
			style={styles.expandedHost}
		>
			<GlassEffectContainer spacing={theme.spacing(3)}>
				<VStack
					alignment="leading"
					spacing={theme.spacing(3)}
					modifiers={[
						frame({ maxWidth: FILL_AVAILABLE_WIDTH }),
						padding({ all: theme.spacing(3) }),
						glassEffect({
							glass: { variant: "regular", interactive: false },
							shape: "roundedRectangle",
							cornerRadius: theme.radii.card,
						}),
					]}
				>
					<TextField
						autoFocus
						placeholder="Item name"
						text={name}
						onTextChange={actions.changeName}
						modifiers={[
							accessibilityLabel("Item name"),
							textFieldStyle("roundedBorder"),
							textInputAutocapitalization("sentences"),
							font({ textStyle: "body" }),
							frame({
								minHeight: theme.spacing(11),
								maxWidth: FILL_AVAILABLE_WIDTH,
							}),
							submitLabel("done"),
							onSubmit(actions.submit),
						]}
					/>

					<HStack alignment="center" spacing={theme.spacing(3)}>
						<Text
							modifiers={[
								font({ textStyle: "subheadline", weight: "semibold" }),
								foregroundStyle({
									type: "hierarchical",
									style: "secondary",
								}),
								frame({ width: theme.spacing(18), alignment: "leading" }),
							]}
						>
							Quantity
						</Text>
						<TextField
							placeholder="1, dozen, 1 gallon"
							text={quantity}
							onTextChange={actions.changeQuantity}
							modifiers={[
								accessibilityLabel("Quantity"),
								textFieldStyle("plain"),
								font({ textStyle: "subheadline" }),
								frame({
									minHeight: theme.spacing(10),
									maxWidth: FILL_AVAILABLE_WIDTH,
								}),
								padding({ horizontal: theme.spacing(3) }),
								submitLabel("done"),
								onSubmit(actions.submit),
							]}
						/>
					</HStack>

					{ui.isNoteOpen ? (
						<TextField
							axis="vertical"
							placeholder="Add a note"
							text={notes}
							onTextChange={actions.changeNotes}
							modifiers={[
								accessibilityLabel("Item note"),
								textFieldStyle("roundedBorder"),
								font({ textStyle: "subheadline" }),
								lineLimit({ min: 2, max: 3 }),
								frame({
									minHeight: theme.spacing(15),
									maxWidth: FILL_AVAILABLE_WIDTH,
								}),
							]}
						/>
					) : null}

					{ui.errorMessage ? (
						<Text
							modifiers={[
								accessibilityLabel(ui.errorMessage),
								font({ textStyle: "caption", weight: "semibold" }),
								foregroundStyle(theme.colors.destructive),
							]}
						>
							{ui.errorMessage}
						</Text>
					) : null}

					<HStack alignment="center" spacing={theme.spacing(2)}>
						<Button
							label={ui.isNoteOpen ? "Remove Note" : "Add Note"}
							onPress={actions.toggleNote}
							modifiers={[
								accessibilityLabel(ui.isNoteOpen ? "Remove note" : "Add note"),
								buttonStyle("glass"),
								buttonBorderShape("capsule"),
								controlSize("regular"),
							]}
						/>
						<Text
							modifiers={[
								accessibilityLabel(`Selected List: ${ui.listName}`),
								font({ textStyle: "caption", weight: "semibold" }),
								foregroundStyle({
									type: "hierarchical",
									style: "secondary",
								}),
								padding({
									horizontal: theme.spacing(3),
									vertical: theme.spacing(2),
								}),
								glassEffect({ glass: { variant: "clear" }, shape: "capsule" }),
							]}
						>
							{ui.listName}
						</Text>
						<Spacer minLength={theme.spacing(2)} />
						<Button
							label="Add Item"
							onPress={actions.submit}
							modifiers={[
								buttonStyle("glass"),
								buttonBorderShape("capsule"),
								controlSize("regular"),
								tint(theme.colors.primary),
								disabled(!ui.canSubmit),
							]}
						/>
					</HStack>
				</VStack>
			</GlassEffectContainer>
		</Host>
	);
}

export function useAddItemComposerScrollInset(): number {
	const insets = useSafeAreaInsets();
	const keyboardHeight = useKeyboardHeight();

	return (
		Math.max(keyboardHeight, insets.bottom) + ADD_ITEM_COMPOSER_SCROLL_CLEARANCE
	);
}

function useKeyboardHeight(): number {
	const [keyboardHeight, setKeyboardHeight] = useState(0);

	useEffect(() => {
		const showSubscription = Keyboard.addListener(
			"keyboardWillShow",
			(event) => {
				setKeyboardHeight(event.endCoordinates.height);
			},
		);
		const hideSubscription = Keyboard.addListener("keyboardWillHide", () => {
			setKeyboardHeight(0);
		});

		return () => {
			showSubscription.remove();
			hideSubscription.remove();
		};
	}, []);

	return keyboardHeight;
}

const styles = StyleSheet.create((theme) => ({
	overlay: {
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		zIndex: 40,
	},
	dismissLayer: {
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		zIndex: 10,
	},
	entryContainer: {
		position: "relative",
		zIndex: 20,
		paddingTop: theme.spacing(2),
		paddingHorizontal: theme.spacing(4),
		backgroundColor: theme.colors.background,
	},
	entryHost: {
		width: "100%",
		height: theme.spacing(14),
	},
	composerHost: {
		position: "absolute",
		left: theme.spacing(2.5),
		right: theme.spacing(2.5),
		zIndex: 20,
	},
	expandedHost: {
		width: "100%",
	},
}));
