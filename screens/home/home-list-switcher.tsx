import { BottomSheet, Group, RNHostView } from "@expo/ui/swift-ui";
import {
	background,
	containerRelativeFrame,
	presentationDetents,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	Text,
	TextInput,
	View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { ListSummary } from "@/lib/services/list";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { lightTheme } from "@/lib/unistyles/unistyles";
import { HomeRetryButton, HomeStatus } from "./home-status";
import { useHomeListSwitcher } from "./use-home-list-switcher";

export type HomeListSwitcherSheetProps = {
	currentListId: string | null;
	initialMode: "switcher" | "create";
	isPresented: boolean;
	onCurrentListDeletedWithoutFallback: (listId: string) => void;
	onCurrentListRenamed: () => void;
	onIsPresentedChange: (isPresented: boolean) => void;
	onListSelected: (listId: string) => void;
	session: AuthenticatedAppSession;
};

export function HomeListSwitcherSheet({
	currentListId,
	initialMode,
	isPresented,
	onCurrentListDeletedWithoutFallback,
	onCurrentListRenamed,
	onIsPresentedChange,
	onListSelected,
	session,
}: HomeListSwitcherSheetProps) {
	const switcher = useHomeListSwitcher({
		currentListId,
		initialMode,
		isPresented,
		onCurrentListDeletedWithoutFallback,
		onCurrentListRenamed,
		onIsPresentedChange,
		onListSelected,
		session,
	});

	return (
		<BottomSheet
			isPresented={isPresented}
			onIsPresentedChange={onIsPresentedChange}
		>
			<Group
				modifiers={[
					presentationDetents(["medium", "large"]),
					presentationDragIndicator("visible"),
					containerRelativeFrame({ axes: "vertical", alignment: "top" }),
					background(lightTheme.colors.background),
				]}
			>
				<RNHostView>
					<View style={styles.sheet}>
						{switcher.mode.name === "create" ? (
							<ListNameForm
								actionLabel="Create List"
								draftName={switcher.mode.draftName}
								isSubmitting={switcher.mode.isSubmitting}
								message={switcher.mode.message}
								onBack={currentListId ? switcher.backToSwitcher : undefined}
								onChangeName={switcher.setDraftName}
								onSubmit={switcher.createList}
								title="Create List"
							/>
						) : switcher.mode.name === "rename" ? (
							<ListNameForm
								actionLabel="Rename"
								draftName={switcher.mode.draftName}
								isSubmitting={switcher.mode.isSubmitting}
								message={switcher.mode.message}
								onBack={switcher.backToSwitcher}
								onChangeName={switcher.setDraftName}
								onSubmit={switcher.renameList}
								title={`Rename ${switcher.mode.summary.name}`}
							/>
						) : switcher.mode.name === "confirmDelete" ? (
							<ConfirmDelete
								isSubmitting={switcher.mode.isSubmitting}
								message={switcher.mode.message}
								onBack={switcher.backToSwitcher}
								onDelete={switcher.deleteList}
								summary={switcher.mode.summary}
							/>
						) : switcher.state.status === "loading" ? (
							<HomeStatus title="Loading Lists" body="Preparing active Lists.">
								<ActivityIndicator />
							</HomeStatus>
						) : switcher.state.status === "error" ? (
							<HomeStatus
								title="Lists unavailable"
								body="Unable to load active Lists. Please try again."
							>
								<HomeRetryButton onPress={switcher.retry} />
							</HomeStatus>
						) : (
							<ScrollView
								contentContainerStyle={styles.listContent}
								style={styles.list}
							>
								<Pressable
									accessibilityRole="button"
									onPress={switcher.openCreate}
									style={({ pressed }) => [
										styles.primaryButton,
										pressed ? styles.buttonPressed : undefined,
									]}
								>
									<Text style={styles.primaryButtonLabel}>Create List</Text>
								</Pressable>
								{switcher.state.summaries.map((summary) => (
									<ListSwitcherRow
										current={summary.id === currentListId}
										key={summary.id}
										onDelete={switcher.openDelete}
										onPress={switcher.selectList}
										onRename={switcher.openRename}
										summary={summary}
										switching={switcher.switchingListId === summary.id}
									/>
								))}
							</ScrollView>
						)}
					</View>
				</RNHostView>
			</Group>
		</BottomSheet>
	);
}

function ListSwitcherRow({
	current,
	onDelete,
	onPress,
	onRename,
	summary,
	switching,
}: {
	current: boolean;
	onDelete: (summary: ListSummary) => void;
	onPress: (listId: string) => void;
	onRename: (summary: ListSummary) => void;
	summary: ListSummary;
	switching: boolean;
}) {
	return (
		<View style={[styles.row, current ? styles.currentRow : undefined]}>
			<Pressable
				accessibilityLabel={listSwitcherRowLabel(summary, current)}
				accessibilityRole="button"
				accessibilityState={{ selected: current, busy: switching }}
				onPress={() => onPress(summary.id)}
				style={({ pressed }) => [
					styles.rowSelectArea,
					pressed ? styles.rowPressed : undefined,
				]}
			>
				<View style={styles.rowTitleGroup}>
					<Text numberOfLines={1} style={styles.rowName}>
						{summary.name}
					</Text>
					{current ? (
						<Text style={styles.currentIndicator}>Current</Text>
					) : null}
				</View>
				<View style={styles.countGroup}>
					<Text style={styles.countText}>
						{summary.uncheckedItemCount} unchecked
					</Text>
					<Text style={styles.countText}>
						{summary.checkedItemCount} checked
					</Text>
				</View>
			</Pressable>
			<View style={styles.rowActions}>
				<RowActionButton
					label={`Rename List ${summary.name}`}
					onPress={() => onRename(summary)}
					text="Rename"
				/>
				<RowActionButton
					destructive
					label={`Delete List ${summary.name}`}
					onPress={() => onDelete(summary)}
					text="Delete"
				/>
			</View>
		</View>
	);
}

function RowActionButton({
	destructive,
	label,
	onPress,
	text,
}: {
	destructive?: boolean;
	label: string;
	onPress: () => void;
	text: string;
}) {
	return (
		<Pressable
			accessibilityLabel={label}
			accessibilityRole="button"
			onPress={onPress}
			style={({ pressed }) => [
				styles.rowActionButton,
				destructive ? styles.destructiveRowActionButton : undefined,
				pressed ? styles.buttonPressed : undefined,
			]}
		>
			<Text
				style={[
					styles.rowActionLabel,
					destructive ? styles.destructiveRowActionLabel : undefined,
				]}
			>
				{text}
			</Text>
		</Pressable>
	);
}

function ListNameForm({
	actionLabel,
	draftName,
	isSubmitting,
	message,
	onBack,
	onChangeName,
	onSubmit,
	title,
}: {
	actionLabel: string;
	draftName: string;
	isSubmitting: boolean;
	message: string | null;
	onBack?: () => void;
	onChangeName: (value: string) => void;
	onSubmit: () => void;
	title: string;
}) {
	return (
		<View style={styles.form}>
			<Text style={styles.formTitle}>{title}</Text>
			<TextInput
				accessibilityLabel="List name"
				autoCapitalize="words"
				autoCorrect
				onChangeText={onChangeName}
				placeholder="List name"
				returnKeyType="done"
				style={styles.input}
				value={draftName}
			/>
			{message ? <Text style={styles.message}>{message}</Text> : null}
			<View style={styles.formActions}>
				{onBack ? (
					<Pressable
						accessibilityRole="button"
						onPress={onBack}
						style={({ pressed }) => [
							styles.secondaryButton,
							pressed ? styles.buttonPressed : undefined,
						]}
					>
						<Text style={styles.secondaryButtonLabel}>Cancel</Text>
					</Pressable>
				) : null}
				<Pressable
					accessibilityRole="button"
					accessibilityState={{ busy: isSubmitting }}
					onPress={onSubmit}
					style={({ pressed }) => [
						styles.primaryButton,
						pressed ? styles.buttonPressed : undefined,
					]}
				>
					<Text style={styles.primaryButtonLabel}>
						{isSubmitting ? "Saving" : actionLabel}
					</Text>
				</Pressable>
			</View>
		</View>
	);
}

function ConfirmDelete({
	isSubmitting,
	message,
	onBack,
	onDelete,
	summary,
}: {
	isSubmitting: boolean;
	message: string | null;
	onBack: () => void;
	onDelete: () => void;
	summary: ListSummary;
}) {
	return (
		<View style={styles.form}>
			<Text style={styles.formTitle}>Delete {summary.name}</Text>
			<Text style={styles.formBody}>
				This removes the List from active Lists.
			</Text>
			{message ? <Text style={styles.message}>{message}</Text> : null}
			<View style={styles.formActions}>
				<Pressable
					accessibilityRole="button"
					onPress={onBack}
					style={({ pressed }) => [
						styles.secondaryButton,
						pressed ? styles.buttonPressed : undefined,
					]}
				>
					<Text style={styles.secondaryButtonLabel}>Cancel</Text>
				</Pressable>
				<Pressable
					accessibilityLabel={`Confirm Delete List ${summary.name}`}
					accessibilityRole="button"
					accessibilityState={{ busy: isSubmitting }}
					onPress={onDelete}
					style={({ pressed }) => [
						styles.destructiveButton,
						pressed ? styles.buttonPressed : undefined,
					]}
				>
					<Text style={styles.destructiveButtonLabel}>
						{isSubmitting ? "Deleting" : "Delete"}
					</Text>
				</Pressable>
			</View>
		</View>
	);
}

function listSwitcherRowLabel(summary: ListSummary, current: boolean): string {
	const currentLabel = current ? ", current" : "";
	return `${summary.name}, ${summary.uncheckedItemCount} unchecked, ${summary.checkedItemCount} checked${currentLabel}`;
}

const styles = StyleSheet.create((theme) => ({
	sheet: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	list: {
		flex: 1,
	},
	listContent: {
		paddingHorizontal: theme.spacing(5),
		paddingVertical: theme.spacing(4),
		gap: theme.spacing(2),
	},
	row: {
		minHeight: theme.spacing(18),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		backgroundColor: theme.colors.surface,
		overflow: "hidden",
	},
	rowSelectArea: {
		paddingHorizontal: theme.spacing(4),
		paddingVertical: theme.spacing(3),
		gap: theme.spacing(2),
	},
	currentRow: {
		borderColor: theme.colors.primary,
	},
	rowPressed: {
		opacity: theme.opacities.pressed,
	},
	rowActions: {
		flexDirection: "row",
		gap: theme.spacing(2),
		paddingHorizontal: theme.spacing(4),
		paddingBottom: theme.spacing(3),
	},
	rowActionButton: {
		minHeight: theme.spacing(9),
		paddingHorizontal: theme.spacing(3),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.background,
		borderWidth: theme.borders.hairline,
		borderColor: theme.colors.border,
	},
	destructiveRowActionButton: {
		borderColor: theme.colors.destructive,
	},
	rowActionLabel: {
		...theme.typography.captionStrong,
		color: theme.colors.text,
	},
	destructiveRowActionLabel: {
		color: theme.colors.destructive,
	},
	rowTitleGroup: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: theme.spacing(3),
	},
	rowName: {
		flex: 1,
		color: theme.colors.text,
		fontSize: theme.fontSizes.headline,
		fontWeight: theme.fontWeights.bold,
	},
	currentIndicator: {
		...theme.typography.captionStrong,
		color: theme.colors.primary,
	},
	countGroup: {
		flexDirection: "row",
		gap: theme.spacing(3),
	},
	countText: {
		...theme.typography.caption,
		color: theme.colors.textMuted,
	},
	form: {
		flex: 1,
		gap: theme.spacing(4),
		paddingHorizontal: theme.spacing(5),
		paddingVertical: theme.spacing(5),
		backgroundColor: theme.colors.background,
	},
	formTitle: {
		...theme.typography.headline,
		color: theme.colors.text,
	},
	formBody: {
		...theme.typography.callout,
		color: theme.colors.textMuted,
	},
	input: {
		minHeight: theme.spacing(12),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		backgroundColor: theme.colors.surface,
		paddingHorizontal: theme.spacing(3),
		color: theme.colors.text,
		fontSize: theme.fontSizes.body,
	},
	message: {
		...theme.typography.callout,
		color: theme.colors.destructive,
	},
	formActions: {
		flexDirection: "row",
		gap: theme.spacing(3),
	},
	primaryButton: {
		minHeight: theme.spacing(11),
		paddingHorizontal: theme.spacing(4),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.primary,
	},
	primaryButtonLabel: {
		...theme.typography.callout,
		color: theme.colors.inverseText,
		fontWeight: theme.fontWeights.bold,
	},
	secondaryButton: {
		minHeight: theme.spacing(11),
		paddingHorizontal: theme.spacing(4),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		alignItems: "center",
		justifyContent: "center",
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		backgroundColor: theme.colors.surface,
	},
	secondaryButtonLabel: {
		...theme.typography.callout,
		color: theme.colors.text,
		fontWeight: theme.fontWeights.bold,
	},
	destructiveButton: {
		minHeight: theme.spacing(11),
		paddingHorizontal: theme.spacing(4),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.destructive,
	},
	destructiveButtonLabel: {
		...theme.typography.callout,
		color: theme.colors.inverseText,
		fontWeight: theme.fontWeights.bold,
	},
	buttonPressed: {
		opacity: theme.opacities.pressed,
	},
}));
