import { BlurView } from "expo-blur";
import type { ComponentProps, RefObject } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const ENTRY_BOTTOM_GAP = 12;
const TRAY_KEYBOARD_GAP = 6;

export type AddItemComposerProps = {
	isOpen: boolean;
	name: string;
	quantity: string;
	note: string;
	isNoteOpen: boolean;
	canSubmit: boolean;
	listName: string;
	keyboardHeight: number;
	itemInputRef: RefObject<TextInput | null>;
	animatedStyle: ComponentProps<typeof Animated.View>["style"];
	onOpen: () => void;
	onDismiss: () => void;
	onSubmit: () => void;
	onNameChange: (value: string) => void;
	onQuantityChange: (value: string) => void;
	onNoteChange: (value: string) => void;
	onToggleNote: () => void;
};

export function AddItemComposer({
	isOpen,
	name,
	quantity,
	note,
	isNoteOpen,
	canSubmit,
	listName,
	keyboardHeight,
	itemInputRef,
	animatedStyle,
	onOpen,
	onDismiss,
	onSubmit,
	onNameChange,
	onQuantityChange,
	onNoteChange,
	onToggleNote,
}: AddItemComposerProps) {
	const insets = useSafeAreaInsets();
	const { theme } = useUnistyles();
	const placeholderColor = theme.colors.textSubtle;

	if (!isOpen) {
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
					onPress={onOpen}
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
				accessibilityRole="button"
				onPress={onDismiss}
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
							ref={itemInputRef}
							accessibilityLabel="Item name"
							value={name}
							onChangeText={onNameChange}
							placeholder="Item name"
							placeholderTextColor={placeholderColor}
							returnKeyType="done"
							onSubmitEditing={onSubmit}
							style={styles.itemInput}
						/>
						<Pressable
							accessibilityLabel="Submit Item"
							accessibilityRole="button"
							accessibilityState={{ disabled: !canSubmit }}
							disabled={!canSubmit}
							onPress={onSubmit}
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
							onChangeText={onQuantityChange}
							placeholder="1, dozen, 1 gallon"
							placeholderTextColor={placeholderColor}
							returnKeyType="done"
							onSubmitEditing={onSubmit}
							style={styles.quantityInput}
						/>
					</View>
					<View style={styles.pillRow}>
						<Pressable
							accessibilityLabel="Add note"
							accessibilityRole="button"
							accessibilityState={{ selected: isNoteOpen }}
							onPress={onToggleNote}
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
							accessibilityLabel={`Selected List: ${listName}`}
							style={styles.pill}
						>
							<Text numberOfLines={1} style={styles.pillText}>
								{listName}
							</Text>
						</View>
					</View>
					{isNoteOpen ? (
						<TextInput
							accessibilityLabel="Item note"
							value={note}
							onChangeText={onNoteChange}
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

const styles = StyleSheet.create((theme) => {
	const composer = theme.components.addItemComposer;

	return {
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
			backgroundColor: composer.colors.entryBackground,
			borderWidth: theme.borders.hairline,
			borderColor: composer.colors.entryBorder,
			boxShadow: composer.shadows.entry,
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
			backgroundColor: composer.colors.trayBackground,
			borderWidth: theme.borders.hairline,
			borderColor: composer.colors.trayBorder,
			boxShadow: composer.shadows.tray,
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
			backgroundColor: composer.colors.inputBackground,
			borderWidth: theme.borders.hairline,
			borderColor: composer.colors.inputBorder,
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
			backgroundColor: composer.colors.fieldBackground,
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
			backgroundColor: composer.colors.pillBackground,
			borderWidth: theme.borders.hairline,
			borderColor: composer.colors.pillBorder,
		},
		pillSelected: {
			backgroundColor: composer.colors.selectedPillBackground,
			borderColor: composer.colors.selectedPillBorder,
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
			backgroundColor: composer.colors.fieldBackground,
			color: theme.colors.text,
			fontSize: theme.fontSizes.callout,
		},
		pressed: {
			opacity: theme.opacities.pressed,
		},
	};
});
