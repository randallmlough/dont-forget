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

const TRAY_KEYBOARD_GAP = 6;
const COMPOSER_COLORS = {
	entryBackground: "rgba(255, 255, 255, 0.86)",
	entryBorder: "rgba(130, 154, 177, 0.38)",
	trayBackground: "rgba(255, 255, 255, 0.78)",
	trayBorder: "rgba(130, 154, 177, 0.4)",
	inputBackground: "rgba(255, 255, 255, 0.74)",
	inputBorder: "rgba(130, 154, 177, 0.36)",
	fieldBackground: "rgba(255, 255, 255, 0.58)",
	pillBackground: "rgba(255, 255, 255, 0.62)",
	pillBorder: "rgba(130, 154, 177, 0.34)",
	selectedPillBackground: "rgba(47, 133, 90, 0.12)",
	selectedPillBorder: "rgba(47, 133, 90, 0.28)",
} as const;
const COMPOSER_SHADOWS = {
	entry: "0 6px 18px rgba(16, 42, 67, 0.12)",
	tray: "0 8px 28px rgba(16, 42, 67, 0.18)",
} as const;

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
	const composerBottomOffset =
		keyboardHeight > 0 ? TRAY_KEYBOARD_GAP : insets.bottom + TRAY_KEYBOARD_GAP;

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
				pointerEvents="box-none"
				testID="add-item-entry-container"
				style={styles.entryContainer}
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
				testID="add-item-composer-host"
				style={[
					styles.composerHost,
					animatedStyle,
					{
						bottom: composerBottomOffset,
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
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		zIndex: 20,
		paddingHorizontal: theme.spacing(4),
	},
	entryHost: {
		minHeight: theme.spacing(11),
		height: theme.spacing(11),
		paddingHorizontal: theme.spacing(3.5),
		borderRadius: theme.spacing(5.5),
		backgroundColor: COMPOSER_COLORS.entryBackground,
		borderWidth: theme.borders.hairline,
		borderColor: COMPOSER_COLORS.entryBorder,
		boxShadow: COMPOSER_SHADOWS.entry,
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
		backgroundColor: COMPOSER_COLORS.trayBackground,
		borderWidth: theme.borders.hairline,
		borderColor: COMPOSER_COLORS.trayBorder,
		boxShadow: COMPOSER_SHADOWS.tray,
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
		backgroundColor: COMPOSER_COLORS.inputBackground,
		borderWidth: theme.borders.hairline,
		borderColor: COMPOSER_COLORS.inputBorder,
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
		backgroundColor: COMPOSER_COLORS.fieldBackground,
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
		backgroundColor: COMPOSER_COLORS.pillBackground,
		borderWidth: theme.borders.hairline,
		borderColor: COMPOSER_COLORS.pillBorder,
	},
	pillSelected: {
		backgroundColor: COMPOSER_COLORS.selectedPillBackground,
		borderColor: COMPOSER_COLORS.selectedPillBorder,
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
		backgroundColor: COMPOSER_COLORS.fieldBackground,
		color: theme.colors.text,
		fontSize: theme.fontSizes.callout,
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
}));
