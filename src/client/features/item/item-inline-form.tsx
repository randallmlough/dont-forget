import { SymbolView } from "expo-symbols";
import { useEffect, useRef } from "react";
import {
	ActivityIndicator,
	Keyboard,
	Pressable,
	Text,
	TextInput,
	type TextInput as TextInputInstance,
	View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ItemCompletionButton } from "./item-row";

export type ItemInlineFormProps = {
	mode: "new" | "existing";
	name: string;
	notes: string;
	noteVisible: boolean;
	checked: boolean;
	saving: boolean;
	onChangeName: (value: string) => void;
	onChangeNotes: (value: string) => void;
	onShowNote: () => void;
	onSubmitTitle: () => void;
	onBlurEditor: (refocus: () => void) => void;
	onOpenDetails: () => void;
	onToggleItem: () => void;
};

export function ItemInlineForm({
	mode,
	name,
	notes,
	noteVisible,
	checked,
	saving,
	onChangeName,
	onChangeNotes,
	onShowNote,
	onSubmitTitle,
	onBlurEditor,
	onOpenDetails,
	onToggleItem,
}: ItemInlineFormProps) {
	const { theme } = useUnistyles();
	const titleRef = useRef<TextInputInstance>(null);
	const noteRef = useRef<TextInputInstance>(null);
	const titleFocusedRef = useRef(false);
	const noteFocusedRef = useRef(false);
	const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const suppressNextBlurRef = useRef(false);
	const focusNoteAfterRenderRef = useRef(false);

	useEffect(() => {
		return () => {
			if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
		};
	}, []);

	useEffect(() => {
		if (!noteVisible || !focusNoteAfterRenderRef.current) return;
		focusNoteAfterRenderRef.current = false;
		noteRef.current?.focus();
	}, [noteVisible]);

	function scheduleEditorBlur() {
		if (suppressNextBlurRef.current) {
			suppressNextBlurRef.current = false;
			return;
		}
		if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
		blurTimerRef.current = setTimeout(() => {
			blurTimerRef.current = null;
			if (titleFocusedRef.current || noteFocusedRef.current) return;
			onBlurEditor(() => titleRef.current?.focus());
		}, 0);
	}

	function cancelScheduledEditorBlur() {
		if (!blurTimerRef.current) return;
		clearTimeout(blurTimerRef.current);
		blurTimerRef.current = null;
	}

	function keepEditorActiveForPress() {
		if (blurTimerRef.current) {
			cancelScheduledEditorBlur();
			return;
		}
		suppressNextBlurRef.current = true;
	}

	function showNote() {
		cancelScheduledEditorBlur();
		focusNoteAfterRenderRef.current = true;
		onShowNote();
	}

	function openDetails() {
		cancelScheduledEditorBlur();
		onOpenDetails();
		Keyboard.dismiss();
	}

	function toggleItem() {
		onToggleItem();
	}

	return (
		<View accessibilityLabel="Item inline editor" style={styles.row}>
			<ItemCompletionButton
				checked={checked}
				disabled={mode === "new" || saving}
				itemName={name}
				onPress={toggleItem}
			/>
			<View style={styles.fields}>
				<TextInput
					accessibilityLabel="Item name"
					autoCapitalize="sentences"
					autoCorrect
					autoFocus
					editable={!saving}
					multiline
					onBlur={() => {
						titleFocusedRef.current = false;
						scheduleEditorBlur();
					}}
					onChangeText={onChangeName}
					onFocus={() => {
						titleFocusedRef.current = true;
					}}
					onSubmitEditing={onSubmitTitle}
					placeholder="New Item"
					placeholderTextColor={theme.colors.mutedForeground}
					ref={titleRef}
					scrollEnabled={false}
					style={styles.nameInput}
					submitBehavior="submit"
					value={name}
				/>
				{noteVisible ? (
					<TextInput
						accessibilityLabel="Item notes"
						autoCapitalize="sentences"
						autoCorrect
						editable={!saving}
						multiline
						onBlur={() => {
							noteFocusedRef.current = false;
							scheduleEditorBlur();
						}}
						onChangeText={onChangeNotes}
						onFocus={() => {
							noteFocusedRef.current = true;
						}}
						placeholder="Notes"
						placeholderTextColor={theme.colors.mutedForeground}
						ref={noteRef}
						style={styles.notesInput}
						value={notes}
					/>
				) : (
					<Pressable
						accessibilityHint="Adds optional notes to this Item"
						accessibilityRole="button"
						disabled={saving}
						onPress={showNote}
						onTouchEnd={showNote}
						onTouchStart={keepEditorActiveForPress}
						style={({ pressed }) => [
							styles.addNote,
							pressed ? styles.pressed : undefined,
						]}
					>
						<Text style={styles.addNoteText}>Add Note</Text>
					</Pressable>
				)}
			</View>
			{saving ? (
				<View accessibilityLabel="Saving Item" style={styles.detailTarget}>
					<ActivityIndicator />
				</View>
			) : (
				<Pressable
					accessibilityHint="Opens all editable Item details"
					accessibilityLabel="Item Details"
					accessibilityRole="button"
					onPress={openDetails}
					onTouchEnd={openDetails}
					onTouchStart={keepEditorActiveForPress}
					style={({ pressed }) => [
						styles.detailTarget,
						pressed ? styles.pressed : undefined,
					]}
				>
					<SymbolView
						name="info.circle"
						size={22}
						tintColor={theme.colors.link}
					/>
				</Pressable>
			)}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	row: {
		minHeight: theme.spacing(17),
		flexDirection: "row",
		alignItems: "flex-start",
		gap: theme.spacing(1),
		paddingLeft: theme.spacing(2),
		paddingRight: theme.spacing(2),
		paddingVertical: theme.spacing(2),
	},
	fields: {
		flex: 1,
		minWidth: 0,
		paddingTop: theme.spacing(1),
	},
	nameInput: {
		minHeight: theme.spacing(8),
		padding: 0,
		color: theme.colors.foreground,
		fontFamily: theme.fontFamilies.serif,
		fontSize: theme.fontSizes.lg,
	},
	notesInput: {
		minHeight: theme.spacing(11),
		padding: 0,
		color: theme.colors.foreground,
		...theme.typography.callout,
	},
	addNote: {
		alignSelf: "flex-start",
		minHeight: theme.spacing(11),
		justifyContent: "center",
	},
	addNoteText: {
		...theme.typography.callout,
		color: theme.colors.link,
	},
	detailTarget: {
		width: theme.spacing(11),
		height: theme.spacing(11),
		alignItems: "center",
		justifyContent: "center",
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
}));
