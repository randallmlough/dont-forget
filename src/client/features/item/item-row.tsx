import { SymbolView } from "expo-symbols";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export type ItemRowProps = {
	id: string;
	name: string;
	quantity: string | null;
	notes: string | null;
	checked: boolean;
	checkedByMemberName?: string | null;
	onEditItem: (itemId: string) => void;
	onToggleItem: (itemId: string) => void;
};

export const ItemRow = memo(function ItemRow({
	id,
	name,
	quantity,
	notes,
	checked,
	checkedByMemberName,
	onEditItem,
	onToggleItem,
}: ItemRowProps) {
	const detailText = itemDetailText(quantity, notes);

	return (
		<View style={styles.row}>
			<ItemCompletionButton
				checked={checked}
				itemName={name}
				onPress={() => onToggleItem(id)}
			/>
			<Pressable
				accessibilityHint="Edits the Item inline"
				accessibilityLabel={`Edit ${name}`}
				accessibilityRole="button"
				onPress={() => onEditItem(id)}
				style={({ pressed }) => [
					styles.content,
					pressed ? styles.pressed : undefined,
				]}
			>
				<Text style={[styles.name, checked ? styles.nameChecked : undefined]}>
					{name}
				</Text>
				{detailText ? <Text style={styles.meta}>{detailText}</Text> : null}
				{checkedByMemberName ? (
					<Text style={styles.meta}>Checked by {checkedByMemberName}</Text>
				) : null}
			</Pressable>
		</View>
	);
});

export type ItemCompletionButtonProps = {
	checked: boolean;
	itemName: string;
	disabled?: boolean;
	onPress: () => void;
};

export function ItemCompletionButton({
	checked,
	itemName,
	disabled = false,
	onPress,
}: ItemCompletionButtonProps) {
	const { theme } = useUnistyles();

	return (
		<Pressable
			accessibilityHint={
				checked ? "Marks the Item incomplete" : "Marks the Item complete"
			}
			accessibilityLabel={itemName || "New Item"}
			accessibilityRole="checkbox"
			accessibilityState={{ checked, disabled }}
			disabled={disabled}
			onPress={onPress}
			style={({ pressed }) => [
				styles.completionTarget,
				pressed ? styles.pressed : undefined,
			]}
		>
			<View
				style={[styles.checkbox, checked ? styles.checkboxChecked : undefined]}
			>
				{checked ? (
					<SymbolView
						name="checkmark"
						size={14}
						tintColor={theme.colors.primaryForeground}
						weight="bold"
					/>
				) : null}
			</View>
		</Pressable>
	);
}

function itemDetailText(
	quantity: string | null,
	notes: string | null,
): string | null {
	const parts = [quantity, notes].filter(
		(part): part is string => part !== null && part.length > 0,
	);
	return parts.length > 0 ? parts.join(" — ") : null;
}

const styles = StyleSheet.create((theme) => ({
	row: {
		minHeight: theme.spacing(17),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(1),
		paddingLeft: theme.spacing(2),
		paddingRight: theme.spacing(5),
		paddingVertical: theme.spacing(2.5),
	},
	completionTarget: {
		width: theme.spacing(11),
		height: theme.spacing(11),
		alignItems: "center",
		justifyContent: "center",
	},
	checkbox: {
		width: theme.spacing(6),
		height: theme.spacing(6),
		borderRadius: theme.radii.lg,
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.subtleForeground,
		alignItems: "center",
		justifyContent: "center",
	},
	checkboxChecked: {
		borderColor: theme.colors.primary,
		backgroundColor: theme.colors.primary,
	},
	content: {
		flex: 1,
		minWidth: 0,
		paddingVertical: theme.spacing(1),
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
	name: {
		color: theme.colors.foreground,
		fontFamily: theme.fontFamilies.serif,
		fontSize: theme.fontSizes.lg,
	},
	nameChecked: {
		color: theme.colors.mutedForeground,
		textDecorationLine: "line-through",
	},
	meta: {
		...theme.typography.caption,
		color: theme.colors.subtleForeground,
		marginTop: theme.spacing(0.5),
	},
}));
