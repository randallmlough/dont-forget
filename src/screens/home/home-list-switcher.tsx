import { useCallback, useRef, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	Text,
	TextInput,
	View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { track } from "@/lib/analytics";
import {
	clearCurrentListSelection,
	setCurrentListSelection,
} from "@/lib/local-storage/current-list-selection";
import type {
	CreateListResult,
	DeleteListResult,
	ListNameValidationError,
	ListSummary,
	RenameListResult,
} from "@/lib/services/list";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { useHomeListSwitcherRows } from "./use-home-list-switcher-rows";

/**
 * Home-owned List sheet: one shell with internal modes
 * `switcher | create | rename | confirmDelete`. Mounted only while open.
 *
 * Selecting a non-current row persists the explicit local Current List
 * selection, emits `list_switched` only after persistence succeeds, hands
 * control back to the task 5 resolver path via `onSwitched` (re-resolution
 * reads the stored selection and remounts the Active List boundary), and
 * closes the sheet. A current-row tap is a complete no-op.
 *
 * Lifecycle writes (create/rename/delete) go through the task 2 ListService;
 * PowerSync uploads the change continuously, so this component never requests a
 * sync. `list_created`, `list_renamed`, and `list_deleted` are service-owned;
 * this component emits no analytics for them and never emits `list_switched`
 * for create or delete-fallback selection repair.
 *
 * `onSwitched` (= resolver reload) flips Home into its loading state, which
 * unmounts this sheet's subtree; every `onSwitched()` call is therefore
 * paired with `onDismiss()` so the Modal closes instead of flickering
 * through an unmount/remount.
 */
export function HomeListSwitcher({
	session,
	currentListId,
	initialMode = "switcher",
	onDismiss,
	onSwitched,
}: {
	session: AuthenticatedAppSession;
	currentListId: string | null;
	initialMode?: "switcher" | "create";
	onDismiss: () => void;
	onSwitched: () => void;
}) {
	const { rows, reload } = useHomeListSwitcherRows(session);
	const [mode, setMode] = useState<SheetMode>({ kind: initialMode });
	const switchingRef = useRef(false);
	const userId = session.activeMember.userId;
	const householdId = session.activeHousehold.id;

	const selectList = useCallback(
		async (listId: string) => {
			// Current row tap: no persistence, no analytics, sheet stays open.
			if (listId === currentListId) return;
			if (switchingRef.current) return;
			switchingRef.current = true;
			try {
				await setCurrentListSelection(userId, householdId, listId);
			} catch {
				// Persistence failed: emit nothing, change nothing, keep the sheet
				// open so the User can try the row again.
				switchingRef.current = false;
				return;
			}
			// Only after the local selection persisted: the explicit switch boundary.
			track("list_switched", {
				household_id: householdId,
				list_id: listId,
				user_id: userId,
			});
			onSwitched();
			onDismiss();
		},
		[currentListId, householdId, onDismiss, onSwitched, userId],
	);

	async function submitCreate(name: string): Promise<string | null> {
		let result: CreateListResult;
		try {
			result = await session.services.lists.createList({ name });
		} catch {
			return GENERIC_ERROR_MESSAGE;
		}
		if (result.status === "invalidName") {
			return listNameValidationMessage(result.reason);
		}
		// didWrite === true: persist the selection first, then update Home via
		// re-resolution, close the sheet, and request sync last — never awaited
		// before the local UI updates.
		try {
			await setCurrentListSelection(userId, householdId, result.list.id);
			onSwitched();
			onDismiss();
		} catch {
			// Selection persistence failed but the List exists locally: fall back
			// to the rows so the User can see and select it.
			setMode({ kind: "switcher" });
			void reload();
		}
		return null;
	}

	async function submitRename(
		listId: string,
		name: string,
	): Promise<string | null> {
		let result: RenameListResult;
		try {
			result = await session.services.lists.renameList({ listId, name });
		} catch {
			return GENERIC_ERROR_MESSAGE;
		}
		if (result.status === "invalidName") {
			return listNameValidationMessage(result.reason);
		}
		if (result.status === "missing" || result.status === "deleted") {
			void reload();
			return LIST_GONE_MESSAGE;
		}
		if (!result.didWrite) {
			// Unchanged trimmed name: a complete no-op — no sync, nothing changed.
			setMode({ kind: "switcher" });
			return null;
		}
		if (listId === currentListId) {
			// The Home header updates through re-resolution, which remounts the
			// Active List boundary; the sheet closes with it.
			onSwitched();
			onDismiss();
		} else {
			setMode({ kind: "switcher" });
			void reload();
		}
		return null;
	}

	async function submitDelete(listId: string): Promise<string | null> {
		let result: DeleteListResult;
		try {
			result = await session.services.lists.deleteList({ listId });
		} catch {
			return GENERIC_ERROR_MESSAGE;
		}
		if (result.status === "missing") {
			void reload();
			return LIST_GONE_MESSAGE;
		}
		if (!result.didWrite) {
			// Already deleted elsewhere: no local write, no sync request. A stale
			// Current List re-resolves through the resolver's in-memory fallback —
			// never persisted from here.
			if (listId === currentListId) {
				onSwitched();
				onDismiss();
			} else {
				setMode({ kind: "switcher" });
				void reload();
			}
			return null;
		}
		if (listId === currentListId) {
			// Explicit User repair: deleting the Current List persists the most
			// recently active remaining List, or clears to zero-active.
			try {
				const remaining = await session.services.lists.listLists({
					archive: "active",
					sort: "recentActivity",
				});
				const fallback = remaining[0];
				if (fallback) {
					await setCurrentListSelection(userId, householdId, fallback.id);
				} else {
					await clearCurrentListSelection(userId, householdId);
				}
			} catch {
				// Repair failed: re-resolution still runs and falls back in memory
				// without persisting.
			}
			onSwitched();
			onDismiss();
		} else {
			setMode({ kind: "switcher" });
			void reload();
		}
		return null;
	}

	// The switcher subtree is mounted only while open and `onDismiss` unmounts
	// it, so `isPresented` is constant `true`; unmount-on-close resets the
	// per-open mode/rows state.
	return (
		<BottomSheet
			isPresented
			onIsPresentedChange={(isPresented) => {
				if (!isPresented) {
					onDismiss();
				}
			}}
		>
			<View style={styles.sheetContent}>
				{mode.kind === "switcher" ? (
					<>
						<Text style={styles.title}>Switch List</Text>
						{rows.status === "loading" ? (
							<View style={styles.statusContainer}>
								<ActivityIndicator />
							</View>
						) : rows.status === "error" ? (
							<View style={styles.statusContainer}>
								<Text style={styles.errorMessage}>
									Unable to load your Lists. Please try again.
								</Text>
								<Pressable
									accessibilityRole="button"
									onPress={() => void reload()}
									style={({ pressed }) => [
										styles.secondaryButton,
										pressed ? styles.pressed : undefined,
									]}
								>
									<Text style={styles.secondaryButtonLabel}>Try again</Text>
								</Pressable>
							</View>
						) : (
							<ScrollView
								alwaysBounceVertical={false}
								style={styles.rowsScroll}
							>
								{rows.summaries.map((summary) => (
									<HomeListSwitcherRow
										key={summary.id}
										summary={summary}
										isCurrent={summary.id === currentListId}
										onSelect={() => void selectList(summary.id)}
										onRename={() =>
											setMode({
												kind: "rename",
												listId: summary.id,
												name: summary.name,
											})
										}
										onDelete={() =>
											setMode({
												kind: "confirmDelete",
												listId: summary.id,
												name: summary.name,
											})
										}
									/>
								))}
							</ScrollView>
						)}
						<Pressable
							accessibilityRole="button"
							onPress={() => setMode({ kind: "create" })}
							style={({ pressed }) => [
								styles.primaryButton,
								pressed ? styles.pressed : undefined,
							]}
						>
							<Text style={styles.primaryButtonLabel}>Create List</Text>
						</Pressable>
					</>
				) : mode.kind === "create" ? (
					<ListNameForm
						title="Create List"
						initialName=""
						submitLabel="Create"
						onSubmit={submitCreate}
						onCancel={
							initialMode === "create"
								? onDismiss
								: () => setMode({ kind: "switcher" })
						}
					/>
				) : mode.kind === "rename" ? (
					<ListNameForm
						title="Rename List"
						initialName={mode.name}
						submitLabel="Save"
						onSubmit={(name) => submitRename(mode.listId, name)}
						onCancel={() => setMode({ kind: "switcher" })}
					/>
				) : (
					<ConfirmDeleteList
						name={mode.name}
						onConfirm={() => submitDelete(mode.listId)}
						onCancel={() => setMode({ kind: "switcher" })}
					/>
				)}
			</View>
		</BottomSheet>
	);
}

type SheetMode =
	| { kind: "switcher" }
	| { kind: "create" }
	| { kind: "rename"; listId: string; name: string }
	| { kind: "confirmDelete"; listId: string; name: string };

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";
const LIST_GONE_MESSAGE = "This List is no longer available.";

function listNameValidationMessage(reason: ListNameValidationError): string {
	return reason === "required"
		? "List name is required."
		: "List names are 80 characters max.";
}

function HomeListSwitcherRow({
	summary,
	isCurrent,
	onSelect,
	onRename,
	onDelete,
}: {
	summary: ListSummary;
	isCurrent: boolean;
	onSelect: () => void;
	onRename: () => void;
	onDelete: () => void;
}) {
	return (
		<View style={styles.row}>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={summary.name}
				accessibilityState={{ selected: isCurrent }}
				onPress={onSelect}
				style={({ pressed }) => [
					styles.rowSelect,
					pressed ? styles.pressed : undefined,
				]}
			>
				<View style={styles.rowTextGroup}>
					<Text style={styles.rowName} numberOfLines={1}>
						{summary.name}
					</Text>
					<Text style={styles.rowCounts}>
						{summary.uncheckedItemCount} unchecked · {summary.checkedItemCount}{" "}
						checked
					</Text>
				</View>
				{isCurrent ? <Text style={styles.currentBadge}>Current</Text> : null}
			</Pressable>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`Rename ${summary.name}`}
				onPress={onRename}
				style={({ pressed }) => [
					styles.rowAction,
					pressed ? styles.pressed : undefined,
				]}
			>
				<Text style={styles.rowActionLabel}>Rename</Text>
			</Pressable>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`Delete ${summary.name}`}
				onPress={onDelete}
				style={({ pressed }) => [
					styles.rowAction,
					pressed ? styles.pressed : undefined,
				]}
			>
				<Text style={[styles.rowActionLabel, styles.rowActionDestructive]}>
					Delete
				</Text>
			</Pressable>
		</View>
	);
}

/**
 * Shared create/rename name form. `onSubmit` resolves to a scoped error
 * message, or null when the submission was handled (mode change or sheet
 * dismissal unmounts this form).
 */
function ListNameForm({
	title,
	initialName,
	submitLabel,
	onSubmit,
	onCancel,
}: {
	title: string;
	initialName: string;
	submitLabel: string;
	onSubmit: (name: string) => Promise<string | null>;
	onCancel: () => void;
}) {
	const [name, setName] = useState(initialName);
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	async function submit() {
		if (submitting) return;
		setSubmitting(true);
		setError(null);
		const failure = await onSubmit(name);
		if (failure !== null) {
			setError(failure);
			setSubmitting(false);
		}
	}

	return (
		<View style={styles.formContent}>
			<Text style={styles.title}>{title}</Text>
			<TextInput
				accessibilityLabel="List name"
				autoFocus
				value={name}
				onChangeText={setName}
				placeholder="List name"
				returnKeyType="done"
				onSubmitEditing={() => void submit()}
				style={styles.nameInput}
			/>
			{error ? <Text style={styles.errorMessage}>{error}</Text> : null}
			<View style={styles.formActions}>
				<Pressable
					accessibilityRole="button"
					disabled={submitting}
					onPress={onCancel}
					style={({ pressed }) => [
						styles.secondaryButton,
						pressed ? styles.pressed : undefined,
					]}
				>
					<Text style={styles.secondaryButtonLabel}>Cancel</Text>
				</Pressable>
				<Pressable
					accessibilityRole="button"
					disabled={submitting}
					onPress={() => void submit()}
					style={({ pressed }) => [
						styles.primaryButton,
						styles.formSubmitButton,
						pressed ? styles.pressed : undefined,
					]}
				>
					<Text style={styles.primaryButtonLabel}>{submitLabel}</Text>
				</Pressable>
			</View>
		</View>
	);
}

function ConfirmDeleteList({
	name,
	onConfirm,
	onCancel,
}: {
	name: string;
	onConfirm: () => Promise<string | null>;
	onCancel: () => void;
}) {
	const [error, setError] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);

	async function confirm() {
		if (deleting) return;
		setDeleting(true);
		setError(null);
		const failure = await onConfirm();
		if (failure !== null) {
			setError(failure);
			setDeleting(false);
		}
	}

	return (
		<View style={styles.formContent}>
			<Text style={styles.title}>Delete List</Text>
			<Text style={styles.confirmBody}>
				{`Delete "${name}"? Its Items will no longer be available.`}
			</Text>
			{error ? <Text style={styles.errorMessage}>{error}</Text> : null}
			<View style={styles.formActions}>
				<Pressable
					accessibilityRole="button"
					disabled={deleting}
					onPress={onCancel}
					style={({ pressed }) => [
						styles.secondaryButton,
						pressed ? styles.pressed : undefined,
					]}
				>
					<Text style={styles.secondaryButtonLabel}>Cancel</Text>
				</Pressable>
				<Pressable
					accessibilityRole="button"
					disabled={deleting}
					onPress={() => void confirm()}
					style={({ pressed }) => [
						styles.destructiveButton,
						styles.formSubmitButton,
						pressed ? styles.pressed : undefined,
					]}
				>
					<Text style={styles.destructiveButtonLabel}>Delete</Text>
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	sheetContent: {
		flex: 1,
		paddingHorizontal: theme.spacing(5),
		paddingTop: theme.spacing(5),
		paddingBottom: theme.spacing(4),
		gap: theme.spacing(3),
		backgroundColor: theme.colors.surface,
	},
	formContent: {
		gap: theme.spacing(3),
	},
	title: {
		...theme.typography.captionStrong,
		color: theme.colors.textMuted,
	},
	statusContainer: {
		alignItems: "center",
		gap: theme.spacing(3),
		paddingVertical: theme.spacing(6),
	},
	errorMessage: {
		...theme.typography.callout,
		color: theme.colors.destructive,
		textAlign: "center",
	},
	confirmBody: {
		...theme.typography.callout,
		color: theme.colors.text,
	},
	nameInput: {
		minHeight: theme.spacing(11),
		paddingHorizontal: theme.spacing(3.5),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		backgroundColor: theme.colors.background,
		color: theme.colors.text,
		fontSize: theme.fontSizes.body,
	},
	formActions: {
		flexDirection: "row",
		justifyContent: "flex-end",
		gap: theme.spacing(2),
	},
	formSubmitButton: {
		minWidth: theme.spacing(24),
	},
	rowsScroll: {
		// A ScrollView with auto height lays out at full content height and never
		// scrolls; flex: 1 bounds it to the remaining detent space inside the
		// sheet so overflowing rows scroll within the detent.
		flex: 1,
	},
	primaryButton: {
		minHeight: theme.spacing(11),
		paddingHorizontal: theme.spacing(3.5),
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
		paddingHorizontal: theme.spacing(3.5),
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
		paddingHorizontal: theme.spacing(3.5),
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
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(2),
		minHeight: theme.spacing(13),
		paddingVertical: theme.spacing(2.5),
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	rowSelect: {
		flex: 1,
		minWidth: 0,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: theme.spacing(3),
	},
	rowTextGroup: {
		flex: 1,
		minWidth: 0,
		gap: theme.spacing(0.5),
	},
	rowName: {
		...theme.typography.headline,
		color: theme.colors.text,
	},
	rowCounts: {
		...theme.typography.caption,
		color: theme.colors.textMuted,
	},
	rowAction: {
		minHeight: theme.spacing(11),
		paddingHorizontal: theme.spacing(1.5),
		alignItems: "center",
		justifyContent: "center",
	},
	rowActionLabel: {
		...theme.typography.captionStrong,
		color: theme.colors.primary,
	},
	rowActionDestructive: {
		color: theme.colors.destructive,
	},
	currentBadge: {
		...theme.typography.captionStrong,
		color: theme.colors.primary,
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
}));
