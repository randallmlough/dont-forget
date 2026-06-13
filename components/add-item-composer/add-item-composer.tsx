import { BlurView } from "expo-blur";
import { useEffect, useState } from "react";
import { Keyboard, Pressable, Text, TextInput, View } from "react-native";
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
	const { theme } = useUnistyles();
	const placeholderColor = theme.colors.textSubtle;
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
				<Pressable
					accessibilityLabel="Add Item"
					accessibilityRole="button"
					onPress={actions.open}
					style={({ pressed }) => [
						styles.entryHost,
						pressed ? styles.pressed : undefined,
					]}
				>
					<Text style={styles.entryLabel}>
						{draft.name.trim() ? draft.name.trim() : "Add Item"}
					</Text>
				</Pressable>
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
				<BlurView intensity={34} tint="light" style={styles.tray}>
					<View style={styles.primaryRow}>
						<TextInput
							accessibilityLabel="Item name"
							autoFocus
							value={draft.name}
							onChangeText={actions.changeName}
							placeholder="Item name"
							placeholderTextColor={placeholderColor}
							returnKeyType="done"
							onSubmitEditing={actions.submit}
							style={styles.itemInput}
						/>
						<Pressable
							accessibilityLabel="Submit Item"
							accessibilityRole="button"
							accessibilityState={{ disabled: !ui.canSubmit }}
							disabled={!ui.canSubmit}
							onPress={actions.submit}
							style={({ pressed }) => [
								styles.submitButton,
								!ui.canSubmit ? styles.submitButtonDisabled : undefined,
								pressed && ui.canSubmit ? styles.pressed : undefined,
							]}
						>
							<Text style={styles.submitLabel}>+</Text>
						</Pressable>
					</View>
					{ui.errorMessage ? (
						<Text accessibilityRole="alert" style={styles.errorMessage}>
							{ui.errorMessage}
						</Text>
					) : null}
					<View style={styles.quantityRow}>
						<Text style={styles.quantityLabel}>Quantity</Text>
						<TextInput
							accessibilityLabel="Quantity"
							value={draft.quantity}
							onChangeText={actions.changeQuantity}
							placeholder="1, dozen, 1 gallon"
							placeholderTextColor={placeholderColor}
							returnKeyType="done"
							onSubmitEditing={actions.submit}
							style={styles.quantityInput}
						/>
					</View>
					<View style={styles.pillRow}>
						<Pressable
							accessibilityLabel="Add note"
							accessibilityRole="button"
							accessibilityState={{ selected: ui.isNoteOpen }}
							onPress={actions.toggleNote}
							style={({ pressed }) => [
								styles.pill,
								ui.isNoteOpen ? styles.pillSelected : undefined,
								pressed ? styles.pressed : undefined,
							]}
						>
							<Text style={styles.pillText}>
								{ui.isNoteOpen ? "Note" : "Add note"}
							</Text>
						</Pressable>
						<View
							accessibilityLabel={`Selected List: ${ui.listName}`}
							style={styles.pill}
						>
							<Text numberOfLines={1} style={styles.pillText}>
								{ui.listName}
							</Text>
						</View>
					</View>
					{ui.isNoteOpen ? (
						<TextInput
							accessibilityLabel="Item note"
							value={draft.notes}
							onChangeText={actions.changeNotes}
							placeholder="Note"
							placeholderTextColor={placeholderColor}
							style={styles.noteInput}
						/>
					) : null}
				</BlurView>
			</Animated.View>
		</View>
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
		minHeight: theme.spacing(11),
		height: theme.spacing(11),
		paddingHorizontal: theme.spacing(3.5),
		borderRadius: theme.spacing(5.5),
		backgroundColor: theme.effects.addItemComposer.entryBackground,
		borderWidth: theme.borders.hairline,
		borderColor: theme.effects.addItemComposer.entryBorder,
		boxShadow: theme.effects.addItemComposer.entryShadow,
		justifyContent: "center",
	},
	entryLabel: {
		color: theme.colors.text,
		fontSize: theme.fontSizes.callout,
	},
	composerHost: {
		position: "absolute",
		left: theme.spacing(2.5),
		right: theme.spacing(2.5),
		zIndex: 20,
	},
	tray: {
		gap: theme.spacing(2),
		padding: theme.spacing(2.5),
		borderRadius: theme.spacing(4),
		borderCurve: "continuous",
		overflow: "hidden",
		backgroundColor: theme.effects.addItemComposer.trayBackground,
		borderWidth: theme.borders.hairline,
		borderColor: theme.effects.addItemComposer.trayBorder,
		boxShadow: theme.effects.addItemComposer.trayShadow,
	},
	primaryRow: {
		minHeight: theme.spacing(10),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(2),
	},
	itemInput: {
		flex: 1,
		minWidth: 0,
		minHeight: theme.spacing(10),
		paddingHorizontal: theme.spacing(3),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		backgroundColor: theme.effects.addItemComposer.inputBackground,
		borderWidth: theme.borders.hairline,
		borderColor: theme.effects.addItemComposer.inputBorder,
		color: theme.colors.text,
		fontSize: theme.fontSizes.body,
	},
	submitButton: {
		width: theme.spacing(9),
		height: theme.spacing(9),
		borderRadius: theme.spacing(4.5),
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.primary,
	},
	submitButtonDisabled: {
		backgroundColor: theme.colors.primaryDisabled,
	},
	submitLabel: {
		color: theme.colors.inverseText,
		fontSize: theme.fontSizes.headline,
		fontWeight: theme.fontWeights.semibold,
		lineHeight: theme.spacing(6),
	},
	errorMessage: {
		...theme.typography.captionStrong,
		color: theme.colors.destructive,
	},
	quantityRow: {
		minHeight: theme.spacing(8),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(2),
	},
	quantityLabel: {
		width: theme.spacing(17),
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
	},
	quantityInput: {
		flex: 1,
		minWidth: 0,
		minHeight: theme.spacing(8),
		paddingHorizontal: theme.spacing(2.5),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		backgroundColor: theme.effects.addItemComposer.fieldBackground,
		color: theme.colors.text,
		fontSize: theme.fontSizes.callout,
	},
	pillRow: {
		minHeight: theme.spacing(8),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(2),
	},
	pill: {
		maxWidth: "52%",
		minHeight: theme.spacing(8),
		justifyContent: "center",
		paddingHorizontal: theme.spacing(3),
		borderRadius: theme.spacing(4),
		backgroundColor: theme.effects.addItemComposer.pillBackground,
		borderWidth: theme.borders.hairline,
		borderColor: theme.effects.addItemComposer.pillBorder,
	},
	pillSelected: {
		backgroundColor: theme.effects.addItemComposer.selectedPillBackground,
		borderColor: theme.effects.addItemComposer.selectedPillBorder,
	},
	pillText: {
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
	},
	noteInput: {
		minHeight: theme.spacing(8),
		paddingHorizontal: theme.spacing(2.5),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		backgroundColor: theme.effects.addItemComposer.fieldBackground,
		color: theme.colors.text,
		fontSize: theme.fontSizes.callout,
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
}));
