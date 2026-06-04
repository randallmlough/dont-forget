import { BlurView } from "expo-blur";
import { useEffect, useRef, useState } from "react";
import { Keyboard, Pressable, Text, TextInput, View } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { useActiveList } from "./context";

const ENTRY_BOTTOM_GAP = 12;
const TRAY_KEYBOARD_GAP = 6;
const PLACEHOLDER_COLOR = "#829AB1";

export type ActiveListAddItemFormProps = {
	initialComposerOpen?: boolean;
	keyboardHeightOverride?: number;
};

export function ActiveListAddItemForm({
	initialComposerOpen = false,
	keyboardHeightOverride,
}: ActiveListAddItemFormProps) {
	const { actions, state } = useActiveList();
	const insets = useSafeAreaInsets();
	const itemInputRef = useRef<TextInput>(null);
	const openingComposerRef = useRef(initialComposerOpen);
	const visibility = useSharedValue(initialComposerOpen ? 1 : 0);
	const [isComposerOpen, setIsComposerOpen] = useState(initialComposerOpen);
	const [keyboardHeight, setKeyboardHeight] = useState(0);
	const [name, setName] = useState("");
	const [quantity, setQuantity] = useState("");
	const [note, setNote] = useState("");
	const [isNoteOpen, setIsNoteOpen] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const trimmedName = name.trim();
	const canSubmit = trimmedName.length > 0 && !isSubmitting;
	const effectiveKeyboardHeight = keyboardHeightOverride ?? keyboardHeight;

	useEffect(() => {
		const showSubscription = Keyboard.addListener(
			"keyboardWillShow",
			(event) => {
				openingComposerRef.current = false;
				setKeyboardHeight(event.endCoordinates.height);
				visibility.set(
					withTiming(1, {
						duration: Math.min(event.duration, 220),
						easing: Easing.out(Easing.cubic),
					}),
				);
			},
		);
		const hideSubscription = Keyboard.addListener(
			"keyboardWillHide",
			(event) => {
				if (openingComposerRef.current) return;
				setKeyboardHeight(0);
				visibility.set(
					withTiming(0, {
						duration: Math.min(event.duration, 220),
						easing: Easing.out(Easing.cubic),
					}),
				);
				setIsComposerOpen(false);
			},
		);

		return () => {
			showSubscription.remove();
			hideSubscription.remove();
		};
	}, [visibility]);

	useEffect(() => {
		visibility.set(
			withTiming(isComposerOpen ? 1 : 0, {
				duration: 160,
				easing: Easing.out(Easing.cubic),
			}),
		);
		if (!isComposerOpen) return;

		const focusTimer = setTimeout(() => {
			itemInputRef.current?.focus();
		}, 40);
		const openingGuardTimer = setTimeout(() => {
			openingComposerRef.current = false;
		}, 650);

		return () => {
			clearTimeout(focusTimer);
			clearTimeout(openingGuardTimer);
		};
	}, [isComposerOpen, visibility]);

	function openComposer() {
		openingComposerRef.current = true;
		setIsComposerOpen(true);
	}

	function dismissComposer() {
		openingComposerRef.current = false;
		setIsComposerOpen(false);
		Keyboard.dismiss();
	}

	async function submit() {
		if (!canSubmit) return;

		setIsSubmitting(true);
		await actions.addItem(trimmedName);
		setName("");
		setQuantity("");
		setNote("");
		setIsNoteOpen(false);
		setIsSubmitting(false);
		dismissComposer();
	}

	const composerAnimatedStyle = useAnimatedStyle(() => {
		const currentVisibility = visibility.get();

		return {
			opacity: currentVisibility,
			transform: [{ translateY: (1 - currentVisibility) * 10 }],
		};
	});

	if (!isComposerOpen) {
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
					onPress={openComposer}
					style={({ pressed }) => [
						styles.entryHost,
						pressed ? styles.pressed : undefined,
					]}
				>
					<Text style={styles.entryLabel}>
						{name.trim() ? name.trim() : "Add Item"}
					</Text>
				</Pressable>
			</View>
		);
	}

	return (
		<View pointerEvents="box-none" style={styles.overlay}>
			<Pressable
				accessibilityLabel="Dismiss add Item composer"
				onPress={dismissComposer}
				style={styles.dismissLayer}
			/>
			<Animated.View
				style={[
					styles.composerHost,
					composerAnimatedStyle,
					{
						bottom: effectiveKeyboardHeight + TRAY_KEYBOARD_GAP,
					},
				]}
			>
				<BlurView intensity={34} tint="light" style={styles.tray}>
					<View style={styles.primaryRow}>
						<TextInput
							ref={itemInputRef}
							accessibilityLabel="Item name"
							autoFocus
							value={name}
							onChangeText={setName}
							placeholder="Item name"
							placeholderTextColor={PLACEHOLDER_COLOR}
							returnKeyType="done"
							onSubmitEditing={submit}
							style={styles.itemInput}
						/>
						<Pressable
							accessibilityLabel="Submit Item"
							accessibilityRole="button"
							accessibilityState={{ disabled: !canSubmit }}
							disabled={!canSubmit}
							onPress={submit}
							style={({ pressed }) => [
								styles.submitButton,
								!canSubmit ? styles.submitButtonDisabled : undefined,
								pressed && canSubmit ? styles.pressed : undefined,
							]}
						>
							<Text style={styles.submitLabel}>+</Text>
						</Pressable>
					</View>
					<View style={styles.quantityRow}>
						<Text style={styles.quantityLabel}>Quantity</Text>
						<TextInput
							accessibilityLabel="Quantity"
							value={quantity}
							onChangeText={setQuantity}
							placeholder="1, dozen, 1 gallon"
							placeholderTextColor={PLACEHOLDER_COLOR}
							returnKeyType="done"
							onSubmitEditing={submit}
							style={styles.quantityInput}
						/>
					</View>
					<View style={styles.pillRow}>
						<Pressable
							accessibilityLabel="Add note"
							accessibilityRole="button"
							onPress={() => setIsNoteOpen((current) => !current)}
							style={({ pressed }) => [
								styles.pill,
								isNoteOpen ? styles.pillSelected : undefined,
								pressed ? styles.pressed : undefined,
							]}
						>
							<Text style={styles.pillText}>
								{isNoteOpen ? "Note" : "Add note"}
							</Text>
						</Pressable>
						<View
							accessibilityLabel={`Selected List: ${state.listName}`}
							style={styles.pill}
						>
							<Text numberOfLines={1} style={styles.pillText}>
								{state.listName}
							</Text>
						</View>
					</View>
					{isNoteOpen ? (
						<TextInput
							accessibilityLabel="Item note"
							value={note}
							onChangeText={setNote}
							placeholder="Note"
							placeholderTextColor={PLACEHOLDER_COLOR}
							style={styles.noteInput}
						/>
					) : null}
				</BlurView>
			</Animated.View>
		</View>
	);
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
		backgroundColor: "rgba(255, 255, 255, 0.86)",
		borderWidth: theme.borders.hairline,
		borderColor: "rgba(130, 154, 177, 0.38)",
		boxShadow: "0 6px 18px rgba(16, 42, 67, 0.12)",
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
		backgroundColor: "rgba(255, 255, 255, 0.78)",
		borderWidth: theme.borders.hairline,
		borderColor: "rgba(130, 154, 177, 0.4)",
		boxShadow: "0 8px 28px rgba(16, 42, 67, 0.18)",
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
		backgroundColor: "rgba(255, 255, 255, 0.74)",
		borderWidth: theme.borders.hairline,
		borderColor: "rgba(130, 154, 177, 0.36)",
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
		backgroundColor: "rgba(255, 255, 255, 0.58)",
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
		backgroundColor: "rgba(255, 255, 255, 0.62)",
		borderWidth: theme.borders.hairline,
		borderColor: "rgba(130, 154, 177, 0.34)",
	},
	pillSelected: {
		backgroundColor: "rgba(47, 133, 90, 0.12)",
		borderColor: "rgba(47, 133, 90, 0.28)",
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
		backgroundColor: "rgba(255, 255, 255, 0.58)",
		color: theme.colors.text,
		fontSize: theme.fontSizes.callout,
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
}));
