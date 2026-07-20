import {
	Button,
	GlassEffectContainer,
	Host,
	HStack,
	Image,
	Picker,
	Spacer,
	Text,
	TextField,
	useNativeState,
	VStack,
} from "@expo/ui/swift-ui";
import {
	accessibilityHidden,
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
	pickerStyle,
	submitLabel,
	tag,
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
import { nativeColorScheme } from "@/client/theme/native-color-scheme";

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

export type AddItemListOption = {
	id: string;
	name: string;
};

export type AddItemComposerUiState = {
	isOpen: boolean;
	canSubmit: boolean;
	selectedListId: string;
	listOptions: readonly AddItemListOption[];
	errorMessage: string | null;
};

export type AddItemComposerActions = {
	open: () => void;
	dismiss: () => void;
	changeList: (listId: string) => void;
	submit: () => void;
	changeName: (value: string) => void;
	changeQuantity: (value: string) => void;
	changeNotes: (value: string) => void;
};

export function AddItemComposer({ draft, ui, actions }: AddItemComposerProps) {
	const insets = useSafeAreaInsets();
	const { rt } = useUnistyles();
	const colorScheme = nativeColorScheme(rt.themeName);
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
			transform: [{ translateY: (1 - currentVisibility) * 16 }],
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
					onCancel={dismissComposer}
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
						foregroundStyle(theme.colors.foreground),
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
	onCancel,
}: {
	colorScheme: "light" | "dark";
	draft: AddItemComposerDraft;
	ui: AddItemComposerUiState;
	actions: AddItemComposerActions;
	onCancel: () => void;
}) {
	const { theme } = useUnistyles();
	const name = useNativeState(draft.name);
	const quantity = useNativeState(draft.quantity);
	const notes = useNativeState(draft.notes);
	const fieldCornerRadius = theme.spacing(2.5);

	return (
		<Host
			colorScheme={colorScheme}
			matchContents={{ vertical: true }}
			style={styles.expandedHost}
		>
			<GlassEffectContainer spacing={theme.spacing(3)}>
				<VStack
					alignment="leading"
					spacing={theme.spacing(2.5)}
					modifiers={[
						frame({ maxWidth: FILL_AVAILABLE_WIDTH }),
						padding({ all: theme.spacing(3.5) }),
						glassEffect({
							glass: { variant: "regular", interactive: false },
							shape: "roundedRectangle",
							cornerRadius: theme.radii["2xl"],
						}),
					]}
				>
					<HStack alignment="center" spacing={theme.spacing(2)}>
						<Text
							modifiers={[
								font({ textStyle: "callout", weight: "medium" }),
								foregroundStyle(theme.colors.foreground),
							]}
						>
							New Item
						</Text>
						<Spacer minLength={theme.spacing(2)} />
						<Button
							label="Cancel"
							onPress={onCancel}
							modifiers={[
								accessibilityLabel("Cancel Item composer"),
								buttonStyle("plain"),
								controlSize("small"),
								tint(theme.colors.primary),
							]}
						/>
					</HStack>

					<VStack
						alignment="leading"
						spacing={theme.spacing(1)}
						modifiers={[frame({ maxWidth: FILL_AVAILABLE_WIDTH })]}
					>
						<ComposerFieldLabel>Item Name</ComposerFieldLabel>
						<TextField
							autoFocus
							placeholder="Item name"
							text={name}
							onTextChange={actions.changeName}
							modifiers={[
								accessibilityLabel("Item name"),
								textFieldStyle("plain"),
								textInputAutocapitalization("sentences"),
								font({ textStyle: "body" }),
								frame({
									minHeight: theme.spacing(10),
									maxWidth: FILL_AVAILABLE_WIDTH,
								}),
								padding({ horizontal: theme.spacing(3) }),
								glassEffect({
									glass: { variant: "clear", interactive: true },
									shape: "roundedRectangle",
									cornerRadius: fieldCornerRadius,
								}),
								submitLabel("done"),
								onSubmit(actions.submit),
							]}
						/>
					</VStack>

					<HStack alignment="top" spacing={theme.spacing(2.5)}>
						<VStack
							alignment="leading"
							spacing={theme.spacing(1)}
							modifiers={[frame({ maxWidth: FILL_AVAILABLE_WIDTH })]}
						>
							<ComposerFieldLabel>Quantity</ComposerFieldLabel>
							<TextField
								placeholder="1, dozen, 1 gallon"
								text={quantity}
								onTextChange={actions.changeQuantity}
								modifiers={[
									accessibilityLabel("Quantity"),
									textFieldStyle("plain"),
									font({ textStyle: "callout" }),
									frame({
										minHeight: theme.spacing(10),
										maxWidth: FILL_AVAILABLE_WIDTH,
									}),
									padding({ horizontal: theme.spacing(3) }),
									glassEffect({
										glass: { variant: "clear", interactive: true },
										shape: "roundedRectangle",
										cornerRadius: fieldCornerRadius,
									}),
									submitLabel("done"),
									onSubmit(actions.submit),
								]}
							/>
						</VStack>

						<VStack
							alignment="leading"
							spacing={theme.spacing(1)}
							modifiers={[frame({ maxWidth: FILL_AVAILABLE_WIDTH })]}
						>
							<ComposerFieldLabel>List</ComposerFieldLabel>
							<CurrentListPicker
								cornerRadius={fieldCornerRadius}
								options={ui.listOptions}
								selectedListId={ui.selectedListId}
								onSelectionChange={actions.changeList}
							/>
						</VStack>
					</HStack>

					<VStack
						alignment="leading"
						spacing={theme.spacing(1)}
						modifiers={[frame({ maxWidth: FILL_AVAILABLE_WIDTH })]}
					>
						<ComposerFieldLabel>Note</ComposerFieldLabel>
						<TextField
							placeholder="Optional note"
							text={notes}
							onTextChange={actions.changeNotes}
							modifiers={[
								accessibilityLabel("Item note"),
								textFieldStyle("plain"),
								textInputAutocapitalization("sentences"),
								font({ textStyle: "callout" }),
								frame({
									minHeight: theme.spacing(10),
									maxWidth: FILL_AVAILABLE_WIDTH,
								}),
								padding({ horizontal: theme.spacing(3) }),
								glassEffect({
									glass: { variant: "clear", interactive: true },
									shape: "roundedRectangle",
									cornerRadius: fieldCornerRadius,
								}),
								submitLabel("done"),
								onSubmit(actions.submit),
							]}
						/>
					</VStack>

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

					<HStack alignment="center" spacing={theme.spacing(3)}>
						<Text
							modifiers={[
								font({ textStyle: "caption" }),
								foregroundStyle({
									type: "hierarchical",
									style: "secondary",
								}),
							]}
						>
							Press Return to add quickly
						</Text>
						<Spacer minLength={theme.spacing(2)} />
						<Button
							label="Add Item"
							onPress={actions.submit}
							modifiers={[
								buttonStyle("glassProminent"),
								buttonBorderShape("roundedRectangle", fieldCornerRadius),
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

function ComposerFieldLabel({ children }: { children: string }) {
	return (
		<Text
			modifiers={[
				font({ size: 10, weight: "semibold" }),
				foregroundStyle({ type: "hierarchical", style: "secondary" }),
			]}
		>
			{children.toUpperCase()}
		</Text>
	);
}

function CurrentListPicker({
	cornerRadius,
	options,
	selectedListId,
	onSelectionChange,
}: {
	cornerRadius: number;
	options: readonly AddItemListOption[];
	selectedListId: string;
	onSelectionChange: (listId: string) => void;
}) {
	const { theme } = useUnistyles();
	const selectedList =
		options.find((option) => option.id === selectedListId) ?? options[0];
	const canSelect = options.length > 1;
	const field = (
		<HStack
			alignment="center"
			spacing={theme.spacing(2)}
			modifiers={[
				frame({
					minHeight: theme.spacing(10),
					maxWidth: FILL_AVAILABLE_WIDTH,
				}),
				padding({ horizontal: theme.spacing(3) }),
				glassEffect({
					glass: { variant: "clear", interactive: canSelect },
					shape: "roundedRectangle",
					cornerRadius,
				}),
			]}
		>
			<Text
				modifiers={[
					font({ textStyle: "callout" }),
					foregroundStyle(theme.colors.foreground),
					lineLimit(1),
				]}
			>
				{selectedList?.name ?? "List"}
			</Text>
			<Spacer minLength={theme.spacing(1)} />
			{canSelect ? (
				<Image
					systemName="chevron.down"
					modifiers={[
						accessibilityHidden(true),
						font({ textStyle: "caption2", weight: "semibold" }),
						foregroundStyle({
							type: "hierarchical",
							style: "secondary",
						}),
					]}
				/>
			) : null}
		</HStack>
	);

	if (!selectedList) {
		return field;
	}

	return (
		<Picker<string>
			label={field}
			selection={selectedList.id}
			onSelectionChange={onSelectionChange}
			modifiers={[
				accessibilityLabel(`List: ${selectedList.name}. Select List`),
				pickerStyle("menu"),
				buttonStyle("plain"),
				disabled(!canSelect),
				frame({
					minHeight: theme.spacing(10),
					maxWidth: FILL_AVAILABLE_WIDTH,
				}),
				glassEffect({
					glass: { variant: "clear", interactive: canSelect },
					shape: "roundedRectangle",
					cornerRadius,
				}),
			]}
		>
			{options.map((option) => (
				<Text key={option.id} modifiers={[tag(option.id)]}>
					{option.name}
				</Text>
			))}
		</Picker>
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
