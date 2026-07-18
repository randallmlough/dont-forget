import { useRouter } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	Text,
	TextInput,
	View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ScreenScaffold } from "@/client/app-shell/screen-scaffold";
import {
	clearCurrentListSelection,
	setCurrentListSelection,
} from "@/client/features/list/current-selection";
import type {
	CreateListResult,
	DeleteListResult,
	ListNameValidationError,
	ListSummary,
	RenameListResult,
} from "@/client/features/list/list-service";
import {
	type AuthenticatedAppSession,
	type AuthenticatedAppSessionState,
	useAuthenticatedAppSession,
} from "@/client/session";
import { HomeRetryButton, HomeStatus } from "./home-status";
import { useHomeCurrentList } from "./use-home-current-list";
import { type ListRows, useListRows } from "./use-list-rows";
import { useProductServices } from "./use-product-services";
import { useSelectList } from "./use-select-list";

type MutationOutcome =
	| { status: "handled" }
	| { status: "selectionFailed" }
	| { status: "error"; message: string };

export default function ListsScreen() {
	const { state, session, retry } = useAuthenticatedAppSession();

	if (!session) return <ListsSessionState state={state} onRetry={retry} />;
	return (
		<ListsScreenResource key={session.activeHousehold.id} session={session} />
	);
}

function ListsScreenResource({
	session,
}: {
	session: AuthenticatedAppSession;
}) {
	const { rows } = useListRows(session);
	const currentList = useHomeCurrentList(session);
	const selectList = useSelectList(session);
	const services = useProductServices({
		householdId: session.activeHousehold.id,
		userId: session.activeMember.userId,
	});
	const router = useRouter();
	const userId = session.activeMember.userId;
	const householdId = session.activeHousehold.id;
	const currentListId =
		currentList.state.status === "active" ? currentList.state.listId : null;

	async function select(listId: string) {
		if (listId === currentListId) {
			router.replace("/");
			return;
		}
		if (await selectList(listId, currentListId)) router.replace("/");
	}

	async function create(name: string): Promise<MutationOutcome> {
		let result: CreateListResult;
		try {
			result = await services.lists.createList({ name });
		} catch {
			return { status: "error", message: GENERIC_ERROR_MESSAGE };
		}
		if (result.status === "invalidName") {
			return {
				status: "error",
				message: listNameValidationMessage(result.reason),
			};
		}
		try {
			await setCurrentListSelection(userId, householdId, result.list.id);
			router.replace("/");
			return { status: "handled" };
		} catch {
			return { status: "selectionFailed" };
		}
	}

	async function rename(
		listId: string,
		name: string,
	): Promise<MutationOutcome> {
		let result: RenameListResult;
		try {
			result = await services.lists.renameList({ listId, name });
		} catch {
			return { status: "error", message: GENERIC_ERROR_MESSAGE };
		}
		if (result.status === "invalidName") {
			return {
				status: "error",
				message: listNameValidationMessage(result.reason),
			};
		}
		if (result.status === "missing" || result.status === "deleted") {
			return { status: "error", message: LIST_GONE_MESSAGE };
		}
		return { status: "handled" };
	}

	async function deleteList(listId: string): Promise<MutationOutcome> {
		let result: DeleteListResult;
		try {
			result = await services.lists.deleteList({ listId });
		} catch {
			return { status: "error", message: GENERIC_ERROR_MESSAGE };
		}
		if (result.status === "missing") {
			return { status: "error", message: LIST_GONE_MESSAGE };
		}
		if (result.didWrite && listId === currentListId) {
			try {
				const remaining = await services.lists.listLists({
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
				// Home re-resolves the live summaries and falls back in memory.
			}
		}
		return { status: "handled" };
	}

	return (
		<ListsScreenView
			session={session}
			rows={rows}
			currentListId={currentListId}
			onSelectList={select}
			onCreateList={create}
			onRenameList={rename}
			onDeleteList={deleteList}
		/>
	);
}

export type ListsScreenViewProps = {
	session: AuthenticatedAppSession;
	rows: ListRows;
	currentListId: string | null;
	onSelectList: (listId: string) => Promise<void>;
	onCreateList: (name: string) => Promise<MutationOutcome>;
	onRenameList: (listId: string, name: string) => Promise<MutationOutcome>;
	onDeleteList: (listId: string) => Promise<MutationOutcome>;
};

export function ListsScreenView({
	session,
	rows,
	currentListId,
	onSelectList,
	onCreateList,
	onRenameList,
	onDeleteList,
}: ListsScreenViewProps) {
	const [mode, setMode] = useState<ListsMode>({ kind: "rows" });
	const [emptyCreateDismissed, setEmptyCreateDismissed] = useState(false);
	const showAutomaticCreate =
		mode.kind === "rows" &&
		rows.status === "ready" &&
		rows.summaries.length === 0 &&
		!emptyCreateDismissed;

	async function submitCreate(name: string): Promise<string | null> {
		const outcome = await onCreateList(name);
		if (outcome.status === "error") return outcome.message;
		if (outcome.status === "selectionFailed") {
			setEmptyCreateDismissed(true);
			setMode({ kind: "rows" });
		}
		return null;
	}

	async function submitRename(
		listId: string,
		name: string,
	): Promise<string | null> {
		const outcome = await onRenameList(listId, name);
		if (outcome.status === "error") return outcome.message;
		setMode({ kind: "rows" });
		return null;
	}

	async function submitDelete(listId: string): Promise<string | null> {
		const outcome = await onDeleteList(listId);
		if (outcome.status === "error") return outcome.message;
		setMode({ kind: "rows" });
		return null;
	}

	return (
		<ScreenScaffold label="Lists" title={session.activeHousehold.name}>
			<View style={styles.pageContent}>
				{showAutomaticCreate ? (
					<ListNameForm
						title="Create List"
						initialName=""
						submitLabel="Create"
						onSubmit={submitCreate}
						onCancel={() => setEmptyCreateDismissed(true)}
					/>
				) : mode.kind === "create" ? (
					<ListNameForm
						title="Create List"
						initialName=""
						submitLabel="Create"
						onSubmit={submitCreate}
						onCancel={() => setMode({ kind: "rows" })}
					/>
				) : mode.kind === "rename" ? (
					<ListNameForm
						title="Rename List"
						initialName={mode.name}
						submitLabel="Save"
						onSubmit={(name) => submitRename(mode.listId, name)}
						onCancel={() => setMode({ kind: "rows" })}
					/>
				) : mode.kind === "confirmDelete" ? (
					<ConfirmDeleteList
						name={mode.name}
						onConfirm={() => submitDelete(mode.listId)}
						onCancel={() => setMode({ kind: "rows" })}
					/>
				) : (
					<ListRowsView
						rows={rows}
						currentListId={currentListId}
						onSelectList={onSelectList}
						onCreate={() => setMode({ kind: "create" })}
						onRename={(summary) =>
							setMode({
								kind: "rename",
								listId: summary.id,
								name: summary.name,
							})
						}
						onDelete={(summary) =>
							setMode({
								kind: "confirmDelete",
								listId: summary.id,
								name: summary.name,
							})
						}
					/>
				)}
			</View>
		</ScreenScaffold>
	);
}

type ListsMode =
	| { kind: "rows" }
	| { kind: "create" }
	| { kind: "rename"; listId: string; name: string }
	| { kind: "confirmDelete"; listId: string; name: string };

function ListRowsView({
	rows,
	currentListId,
	onSelectList,
	onCreate,
	onRename,
	onDelete,
}: {
	rows: ListRows;
	currentListId: string | null;
	onSelectList: (listId: string) => Promise<void>;
	onCreate: () => void;
	onRename: (summary: ListSummary) => void;
	onDelete: (summary: ListSummary) => void;
}) {
	return (
		<>
			{rows.status === "loading" ? (
				<View style={styles.statusContainer}>
					<ActivityIndicator />
				</View>
			) : rows.status === "error" ? (
				<View style={styles.statusContainer}>
					<Text style={styles.errorMessage}>Unable to load your Lists.</Text>
				</View>
			) : (
				<FlatList
					alwaysBounceVertical={false}
					data={rows.summaries}
					keyExtractor={(summary) => summary.id}
					renderItem={({ item: summary }) => (
						<ListRow
							summary={summary}
							isCurrent={summary.id === currentListId}
							onSelect={() => void onSelectList(summary.id)}
							onRename={() => onRename(summary)}
							onDelete={() => onDelete(summary)}
						/>
					)}
					style={styles.rowsScroll}
				/>
			)}
			<Pressable
				accessibilityRole="button"
				onPress={onCreate}
				style={({ pressed }) => [
					styles.primaryButton,
					pressed ? styles.pressed : undefined,
				]}
			>
				<Text style={styles.primaryButtonLabel}>Create List</Text>
			</Pressable>
		</>
	);
}

function ListRow({
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
					<Text numberOfLines={1} style={styles.rowName}>
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
					accessibilityState={{ disabled: submitting }}
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
					accessibilityState={{ disabled: submitting }}
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
					accessibilityState={{ disabled: deleting }}
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
					accessibilityState={{ disabled: deleting }}
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

function ListsSessionState({
	state,
	onRetry,
}: {
	state: AuthenticatedAppSessionState;
	onRetry: () => void;
}) {
	if (state.status === "error") {
		return (
			<HomeStatus title="Household unavailable" body={state.message}>
				<HomeRetryButton onPress={onRetry} />
			</HomeStatus>
		);
	}
	return (
		<HomeStatus
			title="Preparing your Household"
			body="Loading your Household Lists."
		>
			<ActivityIndicator />
		</HomeStatus>
	);
}

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";
const LIST_GONE_MESSAGE = "This List is no longer available.";

function listNameValidationMessage(reason: ListNameValidationError): string {
	return reason === "required"
		? "List name is required."
		: "List names are 80 characters max.";
}

const styles = StyleSheet.create((theme) => ({
	pageContent: {
		flex: 1,
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(5),
		paddingTop: theme.spacing(5),
		paddingBottom: theme.spacing(4),
	},
	formContent: { gap: theme.spacing(3) },
	title: { ...theme.typography.captionStrong, color: theme.colors.textMuted },
	statusContainer: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: theme.spacing(3),
		paddingVertical: theme.spacing(6),
	},
	errorMessage: {
		...theme.typography.callout,
		color: theme.colors.destructive,
		textAlign: "center",
	},
	confirmBody: { ...theme.typography.callout, color: theme.colors.text },
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
	formSubmitButton: { minWidth: theme.spacing(24) },
	rowsScroll: { flex: 1 },
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
	rowTextGroup: { flex: 1, minWidth: 0, gap: theme.spacing(0.5) },
	rowName: { ...theme.typography.headline, color: theme.colors.text },
	rowCounts: { ...theme.typography.caption, color: theme.colors.textMuted },
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
	rowActionDestructive: { color: theme.colors.destructive },
	currentBadge: {
		...theme.typography.captionStrong,
		color: theme.colors.primary,
	},
	pressed: { opacity: theme.opacities.pressed },
}));
