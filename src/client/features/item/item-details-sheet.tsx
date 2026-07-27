import { SymbolView } from "expo-symbols";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { BottomSheet } from "@/client/ui/bottom-sheet";
import { ButtonIconGlass } from "@/client/ui/button-icon-glass";
import type { ItemEditorSource } from "./item-editor-reducer";
import { ItemListSelectorSheet } from "./item-list-selector-sheet";
import type { ItemEditor } from "./use-item-editor";

export type ItemDetailsSheetProps = {
	editor: ItemEditor;
};

export function ItemDetailsSheet({ editor }: ItemDetailsSheetProps) {
	const { theme } = useUnistyles();
	const presentation = detailsPresentation(editor);
	if (!presentation) return null;

	const selectedList = presentation.listOptions.find(
		(option) => option.id === presentation.selectedListId,
	);
	const canChooseList = presentation.listOptions.length > 1;
	const sourceListId =
		presentation.source.kind === "existing"
			? presentation.source.sourceListId
			: null;

	return (
		<BottomSheet
			header={{
				title: "Details",
				leadingAction: (
					<ButtonIconGlass
						accessibilityHint="Discards detail changes and returns to inline editing"
						accessibilityLabel="Cancel Item Details"
						disabled={presentation.saving}
						onPress={editor.actions.cancelDetails}
						showTint={false}
						systemImage="xmark"
					/>
				),
				trailingAction: (
					<ButtonIconGlass
						accessibilityHint="Saves this Item"
						accessibilityLabel="Save Item"
						disabled={!editor.meta.canSaveDetails}
						loading={presentation.saving}
						onPress={() => {
							void editor.actions.saveDetails();
						}}
						systemImage="checkmark"
					/>
				),
			}}
			isPresented
			onIsPresentedChange={(presented) => {
				if (!presented && !presentation.saving) {
					editor.actions.cancelDetails();
				}
			}}
			showDragIndicator={false}
			snapPoints={["full"]}
			testID="item-details-sheet"
		>
			<ScrollView
				contentContainerStyle={styles.content}
				keyboardShouldPersistTaps="handled"
				nestedScrollEnabled
				style={styles.scroll}
			>
				<View style={styles.fieldGroup}>
					<TextInput
						accessibilityLabel="Item name"
						autoCapitalize="sentences"
						autoCorrect
						editable={!presentation.saving}
						multiline
						onChangeText={editor.actions.changeName}
						placeholder="Item name"
						placeholderTextColor={theme.colors.mutedForeground}
						scrollEnabled={false}
						style={styles.nameInput}
						value={presentation.name}
					/>
					<View style={styles.separator} />
					<TextInput
						accessibilityLabel="Item notes"
						autoCapitalize="sentences"
						autoCorrect
						editable={!presentation.saving}
						multiline
						onChangeText={editor.actions.changeNotes}
						placeholder="Notes"
						placeholderTextColor={theme.colors.mutedForeground}
						style={styles.notesInput}
						value={presentation.notes}
					/>
					<View style={styles.separator} />
					<TextInput
						accessibilityLabel="Item quantity"
						autoCapitalize="sentences"
						autoCorrect
						editable={!presentation.saving}
						onChangeText={editor.actions.changeQuantity}
						placeholder="Quantity, such as 2 kg"
						placeholderTextColor={theme.colors.mutedForeground}
						style={styles.quantityInput}
						value={presentation.quantity}
					/>
				</View>

				<View style={styles.fieldGroup}>
					<Pressable
						accessibilityHint={
							canChooseList
								? "Opens the available Lists"
								: "This is the only active List"
						}
						accessibilityLabel={`List, ${selectedList?.name ?? "Unavailable"}`}
						accessibilityRole="button"
						accessibilityState={{
							disabled: !canChooseList || presentation.saving,
						}}
						disabled={!canChooseList || presentation.saving}
						onPress={editor.actions.openListSelector}
						style={({ pressed }) => [
							styles.listRow,
							pressed ? styles.pressed : undefined,
						]}
					>
						<SymbolView
							name="list.bullet"
							size={22}
							tintColor={theme.colors.primary}
						/>
						<Text style={styles.listLabel}>List</Text>
						<Text
							numberOfLines={1}
							style={[
								styles.listValue,
								selectedList ? undefined : styles.unavailable,
							]}
						>
							{selectedList?.name ?? "Unavailable"}
						</Text>
						{canChooseList ? (
							<SymbolView
								name="chevron.right"
								size={14}
								tintColor={theme.colors.subtleForeground}
								weight="semibold"
							/>
						) : null}
					</Pressable>
				</View>
			</ScrollView>

			<ItemListSelectorSheet
				isPresented={presentation.listSelectorPresented}
				lists={presentation.listOptions}
				selectedListId={presentation.selectedListId}
				sourceListId={sourceListId}
				onClose={editor.actions.closeListSelector}
				onSelectList={editor.actions.selectList}
			/>
		</BottomSheet>
	);
}

type DetailsPresentation = {
	source: ItemEditorSource;
	name: string;
	notes: string;
	quantity: string;
	selectedListId: string;
	listSelectorPresented: boolean;
	listOptions: ItemEditor["meta"]["listOptions"];
	saving: boolean;
};

function detailsPresentation(editor: ItemEditor): DetailsPresentation | null {
	if (editor.state.status === "details") {
		return {
			source: editor.state.source,
			name: editor.state.draft.name,
			notes: editor.state.draft.notes,
			quantity: editor.state.draft.quantity,
			selectedListId: editor.state.draft.selectedListId,
			listSelectorPresented: editor.state.listSelectorPresented,
			listOptions: editor.meta.listOptions,
			saving: false,
		};
	}
	if (
		editor.state.status === "saving" &&
		editor.state.recovery.kind === "details"
	) {
		return {
			source: editor.state.source,
			name: editor.state.draft.name,
			notes: editor.state.draft.notes,
			quantity: editor.state.draft.quantity,
			selectedListId: editor.state.draft.selectedListId,
			listSelectorPresented: false,
			listOptions: editor.meta.listOptions,
			saving: true,
		};
	}
	return null;
}

const styles = StyleSheet.create((theme) => ({
	scroll: {
		flex: 1,
	},
	content: {
		gap: theme.spacing(5),
		paddingHorizontal: theme.spacing(4),
		paddingBottom: theme.spacing(8),
	},
	fieldGroup: {
		overflow: "hidden",
		borderRadius: theme.radii.xl,
		backgroundColor: theme.colors.card,
	},
	nameInput: {
		minHeight: theme.spacing(14),
		paddingHorizontal: theme.spacing(4),
		paddingVertical: theme.spacing(3),
		color: theme.colors.foreground,
		fontFamily: theme.fontFamilies.serif,
		fontSize: theme.fontSizes["2xl"],
	},
	notesInput: {
		minHeight: theme.spacing(20),
		paddingHorizontal: theme.spacing(4),
		paddingVertical: theme.spacing(3),
		color: theme.colors.foreground,
		textAlignVertical: "top",
		...theme.typography.body,
	},
	quantityInput: {
		minHeight: theme.spacing(13),
		paddingHorizontal: theme.spacing(4),
		color: theme.colors.foreground,
		...theme.typography.body,
	},
	separator: {
		height: theme.borders.hairline,
		marginLeft: theme.spacing(4),
		backgroundColor: theme.colors.border,
	},
	listRow: {
		minHeight: theme.spacing(14),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(4),
	},
	listLabel: {
		...theme.typography.body,
		color: theme.colors.foreground,
	},
	listValue: {
		...theme.typography.body,
		flex: 1,
		minWidth: 0,
		color: theme.colors.mutedForeground,
		textAlign: "right",
	},
	unavailable: {
		color: theme.colors.destructive,
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
}));
