import { StyleSheet } from "react-native-unistyles";

export const activeListStyles = StyleSheet.create((theme) => ({
	screen: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	header: {
		paddingHorizontal: theme.spacing(5),
		paddingTop: theme.spacing(5),
		paddingBottom: theme.spacing(4),
		gap: theme.spacing(1),
		backgroundColor: theme.colors.surface,
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	headerTopRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: theme.spacing(3),
	},
	householdName: {
		flex: 1,
		color: theme.colors.textMuted,
		fontSize: theme.fontSizes.footnote,
		fontWeight: theme.fontWeights.semibold,
	},
	refreshButton: {
		minHeight: theme.spacing(11),
		paddingHorizontal: theme.spacing(2.5),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.background,
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.border,
	},
	refreshButtonPressed: {
		opacity: theme.opacities.pressed,
	},
	refreshButtonLabel: {
		...theme.typography.caption,
		color: theme.colors.text,
		fontWeight: theme.fontWeights.bold,
	},
	listName: {
		...theme.typography.largeTitle,
		color: theme.colors.text,
	},
	progressLabel: {
		...theme.typography.callout,
		color: theme.colors.textMuted,
	},
	syncStatus: {
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
	},
	syncStatusSynced: {
		color: theme.colors.primary,
	},
	syncStatusPending: {
		color: theme.colors.link,
	},
	syncStatusFailed: {
		color: theme.colors.destructive,
	},
	errorMessage: {
		fontSize: theme.fontSizes.footnote,
		fontWeight: theme.fontWeights.semibold,
		marginTop: theme.spacing(2),
		color: theme.colors.destructive,
	},
	itemsContent: {
		padding: theme.spacing(5),
	},
	emptyItemsContent: {
		flexGrow: 1,
		justifyContent: "center",
	},
	emptyState: {
		alignItems: "center",
		gap: theme.spacing(2),
		padding: theme.spacing(7),
		borderRadius: theme.radii.card,
		borderCurve: "continuous",
		backgroundColor: theme.colors.surface,
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.border,
	},
	emptyTitle: {
		fontSize: theme.fontSizes.titleSmall,
		fontWeight: theme.fontWeights.bold,
		color: theme.colors.text,
		textAlign: "center",
	},
	emptyBody: {
		...theme.typography.callout,
		color: theme.colors.textMuted,
		textAlign: "center",
	},
	itemRow: {
		minHeight: theme.spacing(16),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		padding: theme.spacing(3.5),
		borderRadius: theme.radii.card,
		borderCurve: "continuous",
		backgroundColor: theme.colors.surface,
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.border,
	},
	itemRowPressed: {
		opacity: theme.opacities.pressed,
	},
	checkbox: {
		width: theme.spacing(6),
		height: theme.spacing(6),
		borderRadius: theme.radii.checkbox,
		borderCurve: "continuous",
		borderWidth: theme.borders.thick,
		borderColor: theme.colors.textSubtle,
		alignItems: "center",
		justifyContent: "center",
	},
	checkboxChecked: {
		borderColor: theme.colors.primary,
		backgroundColor: theme.colors.primary,
	},
	checkboxMark: {
		width: theme.spacing(2.5),
		height: theme.spacing(2.5),
		borderRadius: theme.radii.checkboxMark,
		backgroundColor: theme.colors.inverseText,
	},
	itemTextGroup: {
		flex: 1,
		minWidth: 0,
	},
	itemName: {
		color: theme.colors.text,
		fontSize: theme.fontSizes.subheadline,
		fontWeight: theme.fontWeights.semibold,
	},
	itemNameChecked: {
		color: theme.colors.textMuted,
		textDecorationLine: "line-through",
	},
	itemMeta: {
		...theme.typography.caption,
		color: theme.colors.textSubtle,
		marginTop: theme.spacing(0.5),
	},
	itemSeparator: {
		height: theme.spacing(2.5),
	},
	addForm: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(2.5),
		padding: theme.spacing(4),
		backgroundColor: theme.colors.surface,
		borderTopWidth: theme.borders.hairline,
		borderTopColor: theme.colors.border,
	},
	input: {
		flex: 1,
		minHeight: theme.spacing(12),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.inputBorder,
		paddingHorizontal: theme.spacing(3.5),
		color: theme.colors.text,
		fontSize: theme.fontSizes.body,
		backgroundColor: theme.colors.surface,
	},
	addButton: {
		minWidth: theme.spacing(18),
		height: theme.spacing(12),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.primary,
	},
	addButtonDisabled: {
		backgroundColor: theme.colors.primaryDisabled,
	},
	addButtonPressed: {
		opacity: theme.opacities.pressed,
	},
	addButtonLabel: {
		...theme.typography.controlLabel,
		color: theme.colors.inverseText,
	},
}));
