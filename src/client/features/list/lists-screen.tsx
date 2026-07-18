import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import {
	ActionSheetIOS,
	ActivityIndicator,
	FlatList,
	Pressable,
	Text,
	TextInput,
	View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
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
import { ActionMenuButton } from "@/client/ui/action-menu-button";
import { AppButton } from "@/client/ui/app-button";
import { GlassSurface } from "@/client/ui/glass-surface";
import { SurfaceCard } from "@/client/ui/settings-surface";
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
	if (rows.status !== "ready") {
		return (
			<View style={styles.listLayout}>
				<View style={styles.statusContainer}>
					<GlassSurface style={styles.statusSurface}>
						{rows.status === "loading" ? (
							<ActivityIndicator />
						) : (
							<Text style={styles.errorMessage}>
								Unable to load your Lists.
							</Text>
						)}
					</GlassSurface>
				</View>
				<NewListButton onPress={onCreate} />
			</View>
		);
	}

	const currentSummary = rows.summaries.find(
		(summary) => summary.id === currentListId,
	);
	const otherSummaries = currentSummary
		? rows.summaries.filter((summary) => summary.id !== currentSummary.id)
		: rows.summaries;

	return (
		<View style={styles.listLayout}>
			<FlatList
				alwaysBounceVertical={false}
				contentContainerStyle={styles.rowsContent}
				data={otherSummaries}
				keyExtractor={listSummaryKey}
				ListHeaderComponent={
					<ListCollectionHeader
						currentSummary={currentSummary}
						listCount={otherSummaries.length}
						onDelete={onDelete}
						onRename={onRename}
						onSelectList={onSelectList}
					/>
				}
				renderItem={({ index, item: summary }) => (
					<ListRow
						groupPosition={groupPosition(index, otherSummaries.length)}
						onDelete={() => onDelete(summary)}
						onRename={() => onRename(summary)}
						onSelect={() => void onSelectList(summary.id)}
						summary={summary}
					/>
				)}
				style={styles.rowsScroll}
			/>
			<NewListButton onPress={onCreate} />
		</View>
	);
}

function ListCollectionHeader({
	currentSummary,
	listCount,
	onSelectList,
	onRename,
	onDelete,
}: {
	currentSummary: ListSummary | undefined;
	listCount: number;
	onSelectList: (listId: string) => Promise<void>;
	onRename: (summary: ListSummary) => void;
	onDelete: (summary: ListSummary) => void;
}) {
	return (
		<View style={styles.collectionHeader}>
			{currentSummary ? (
				<CurrentListCard
					onDelete={() => onDelete(currentSummary)}
					onRename={() => onRename(currentSummary)}
					onSelect={() => void onSelectList(currentSummary.id)}
					summary={currentSummary}
				/>
			) : null}
			{listCount > 0 ? (
				<View style={styles.sectionHeading}>
					<Text style={styles.sectionTitle}>
						{currentSummary ? "Other Lists" : "All Lists"}
					</Text>
					<Text style={styles.sectionCount}>{listCount}</Text>
				</View>
			) : null}
		</View>
	);
}

function CurrentListCard({
	summary,
	onSelect,
	onRename,
	onDelete,
}: {
	summary: ListSummary;
	onSelect: () => void;
	onRename: () => void;
	onDelete: () => void;
}) {
	const { theme } = useUnistyles();

	return (
		<GlassSurface interactive style={styles.currentCard} tone="selected">
			<View style={styles.currentCardHeader}>
				<View style={styles.currentStatus}>
					<View style={styles.currentCheck}>
						<SymbolView
							accessibilityElementsHidden
							accessible={false}
							name="checkmark"
							size={12}
							tintColor={theme.colors.primaryActionText}
							weight="bold"
						/>
					</View>
					<Text style={styles.currentLabel}>Current List</Text>
				</View>
				<ActionMenuButton
					accessibilityLabel={`List actions for ${summary.name}`}
					onPress={() => showListActions(summary, onRename, onDelete)}
				/>
			</View>
			<Pressable
				accessibilityHint="Opens the Current List"
				accessibilityLabel={summary.name}
				accessibilityRole="button"
				accessibilityState={{ selected: true }}
				onPress={onSelect}
				style={({ pressed }) => [
					styles.currentCardContent,
					pressed ? styles.pressed : undefined,
				]}
			>
				<Text numberOfLines={2} style={styles.currentName}>
					{summary.name}
				</Text>
				<Text style={styles.listCounts}>{listCounts(summary)}</Text>
				<View style={styles.openListLabel}>
					<Text style={styles.openListText}>Open List</Text>
					<SymbolView
						accessibilityElementsHidden
						accessible={false}
						name="chevron.right"
						size={14}
						tintColor={theme.colors.textMuted}
						weight="semibold"
					/>
				</View>
			</Pressable>
		</GlassSurface>
	);
}

function ListRow({
	summary,
	groupPosition,
	onSelect,
	onRename,
	onDelete,
}: {
	summary: ListSummary;
	groupPosition: "only" | "first" | "middle" | "last";
	onSelect: () => void;
	onRename: () => void;
	onDelete: () => void;
}) {
	return (
		<SurfaceCard groupPosition={groupPosition}>
			<View
				style={[
					styles.listRow,
					groupPosition === "first" || groupPosition === "middle"
						? styles.listRowDivider
						: undefined,
				]}
			>
				<Pressable
					accessibilityHint="Makes this the Current List and opens it"
					accessibilityLabel={summary.name}
					accessibilityRole="button"
					onPress={onSelect}
					style={({ pressed }) => [
						styles.listRowSelect,
						pressed ? styles.pressed : undefined,
					]}
				>
					<Text numberOfLines={1} style={styles.listRowName}>
						{summary.name}
					</Text>
					<Text style={styles.listRowCounts}>{listCounts(summary)}</Text>
				</Pressable>
				<ActionMenuButton
					accessibilityLabel={`List actions for ${summary.name}`}
					onPress={() => showListActions(summary, onRename, onDelete)}
				/>
			</View>
		</SurfaceCard>
	);
}

function NewListButton({ onPress }: { onPress: () => void }) {
	return (
		<View style={styles.newListButton}>
			<AppButton fullWidth label="New List" onPress={onPress} symbol="plus" />
		</View>
	);
}

function listSummaryKey(summary: ListSummary): string {
	return summary.id;
}

function listCounts(summary: ListSummary): string {
	return `${summary.uncheckedItemCount} unchecked · ${summary.checkedItemCount} checked`;
}

function groupPosition(
	index: number,
	length: number,
): "only" | "first" | "middle" | "last" {
	if (length === 1) return "only";
	if (index === 0) return "first";
	if (index === length - 1) return "last";
	return "middle";
}

function showListActions(
	summary: ListSummary,
	onRename: () => void,
	onDelete: () => void,
) {
	ActionSheetIOS.showActionSheetWithOptions(
		{
			title: summary.name,
			options: ["Cancel", "Rename", "Delete"],
			cancelButtonIndex: 0,
			destructiveButtonIndex: 2,
		},
		(index) => {
			if (index === 1) onRename();
			if (index === 2) onDelete();
		},
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
		<GlassSurface style={styles.formSurface}>
			<View style={styles.formContent}>
				<Text style={styles.formTitle}>{title}</Text>
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
					<AppButton disabled={submitting} label="Cancel" onPress={onCancel} />
					<AppButton
						disabled={submitting}
						label={submitLabel}
						onPress={() => void submit()}
						variant="primary"
					/>
				</View>
			</View>
		</GlassSurface>
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
		<GlassSurface style={styles.formSurface}>
			<View style={styles.formContent}>
				<Text style={styles.formTitle}>Delete List</Text>
				<Text style={styles.confirmBody}>
					{`Delete "${name}"? Its Items will no longer be available.`}
				</Text>
				{error ? <Text style={styles.errorMessage}>{error}</Text> : null}
				<View style={styles.formActions}>
					<AppButton disabled={deleting} label="Cancel" onPress={onCancel} />
					<AppButton
						disabled={deleting}
						label="Delete"
						onPress={() => void confirm()}
						variant="destructive"
					/>
				</View>
			</View>
		</GlassSurface>
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
		paddingHorizontal: theme.spacing(5),
		paddingTop: theme.spacing(2),
		paddingBottom: theme.spacing(2),
	},
	listLayout: {
		flex: 1,
	},
	rowsScroll: {
		flex: 1,
	},
	rowsContent: {
		paddingBottom: theme.spacing(3),
	},
	collectionHeader: {
		gap: theme.spacing(3),
	},
	currentCard: {
		borderRadius: theme.radii.card,
		borderCurve: "continuous",
	},
	currentCardHeader: {
		minHeight: theme.spacing(11),
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingLeft: theme.spacing(4),
		paddingRight: theme.spacing(2),
		paddingTop: theme.spacing(1),
	},
	currentStatus: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(2),
	},
	currentCheck: {
		width: theme.spacing(5),
		height: theme.spacing(5),
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.radii.pill,
		backgroundColor: theme.colors.primary,
	},
	currentLabel: {
		...theme.typography.overline,
		color: theme.colors.primary,
		textTransform: "uppercase",
	},
	currentCardContent: {
		minHeight: theme.spacing(26),
		paddingHorizontal: theme.spacing(4),
		paddingTop: theme.spacing(1),
		paddingBottom: theme.spacing(4),
	},
	currentName: {
		fontFamily: theme.fontFamilies.serif,
		fontSize: theme.fontSizes.title,
		color: theme.colors.text,
	},
	listCounts: {
		...theme.typography.caption,
		color: theme.colors.textMuted,
		marginTop: theme.spacing(1),
	},
	openListLabel: {
		minHeight: theme.spacing(8),
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "flex-end",
		gap: theme.spacing(2),
		marginTop: theme.spacing(2),
	},
	openListText: {
		...theme.typography.callout,
		color: theme.colors.text,
	},
	sectionHeading: {
		minHeight: theme.spacing(7),
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: theme.spacing(1),
	},
	sectionTitle: {
		...theme.typography.overline,
		color: theme.colors.textMuted,
		textTransform: "uppercase",
	},
	sectionCount: {
		...theme.typography.caption,
		color: theme.colors.textMuted,
	},
	listRow: {
		minHeight: theme.spacing(14),
		flexDirection: "row",
		alignItems: "center",
		paddingLeft: theme.spacing(4),
		paddingRight: theme.spacing(2),
	},
	listRowDivider: {
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.divider,
	},
	listRowSelect: {
		flex: 1,
		minWidth: 0,
		justifyContent: "center",
		alignSelf: "stretch",
		gap: theme.spacing(0.5),
		paddingVertical: theme.spacing(2.5),
	},
	listRowName: {
		...theme.typography.body,
		color: theme.colors.text,
	},
	listRowCounts: {
		...theme.typography.caption,
		color: theme.colors.textMuted,
	},
	newListButton: {
		paddingTop: theme.spacing(3),
	},
	statusContainer: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: theme.spacing(6),
	},
	statusSurface: {
		minWidth: "78%",
		alignItems: "center",
		justifyContent: "center",
		padding: theme.spacing(5),
		borderRadius: theme.radii.card,
	},
	formSurface: {
		borderRadius: theme.radii.card,
		borderCurve: "continuous",
	},
	formContent: {
		gap: theme.spacing(4),
		padding: theme.spacing(5),
	},
	formTitle: {
		...theme.typography.headline,
		fontFamily: theme.fontFamilies.serif,
		color: theme.colors.text,
	},
	errorMessage: {
		...theme.typography.callout,
		color: theme.colors.destructive,
		textAlign: "center",
	},
	confirmBody: { ...theme.typography.callout, color: theme.colors.text },
	nameInput: {
		minHeight: theme.spacing(12),
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
		flexWrap: "wrap",
		justifyContent: "flex-end",
		gap: theme.spacing(2),
	},
	pressed: { opacity: theme.opacities.pressed },
}));
