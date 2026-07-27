import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	Text,
	View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ScreenScaffold } from "@/client/app-shell/screen-scaffold";
import type {
	ListNameValidationError,
	ListSummary,
} from "@/client/features/list/list-service";
import {
	type ListCollectionState,
	useListCollection,
} from "@/client/features/list/use-list-collection";
import {
	type AuthenticatedAppSession,
	type AuthenticatedAppSessionState,
	useAuthenticatedAppSession,
} from "@/client/session";
import {
	ActionMenuButton,
	type ActionMenuItem,
} from "@/client/ui/action-menu-button";
import { Badge } from "@/client/ui/badge";
import { Button } from "@/client/ui/button";
import { GlassSurface } from "@/client/ui/glass-surface";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemSeparator,
	ItemTitle,
} from "@/client/ui/item";
import { themedAlert, themedPrompt } from "@/client/ui/native-dialogs";
import { ScreenSection } from "@/client/ui/screen-section";
import { StatusCard } from "@/client/ui/status-card";
import { toast } from "@/client/ui/toast";

type ListMutationOutcome =
	| { status: "handled" }
	| { status: "error"; message: string };

type CreateListMutationOutcome =
	| ListMutationOutcome
	| { status: "selectionFailed" };

type GuardedListMutationOutcome = ListMutationOutcome | { status: "ignored" };

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
	const collection = useListCollection(session);
	const router = useRouter();

	async function select(listId: string) {
		const outcome = await collection.actions.selectList({ listId });
		if (outcome.status === "selected" || outcome.status === "alreadyCurrent") {
			router.replace("/");
		}
	}

	async function create(name: string): Promise<CreateListMutationOutcome> {
		const outcome = await collection.actions.createList({ name });
		if (outcome.status === "invalidName") {
			return {
				status: "error",
				message: listNameValidationMessage(outcome.reason),
			};
		}
		if (outcome.status === "createdAndSelected") {
			router.replace("/");
			return { status: "handled" };
		}
		if (outcome.status === "createdSelectionFailed") {
			return { status: "selectionFailed" };
		}
		return { status: "error", message: GENERIC_ERROR_MESSAGE };
	}

	async function rename(
		listId: string,
		name: string,
	): Promise<ListMutationOutcome> {
		const outcome = await collection.actions.renameList({ listId, name });
		if (outcome.status === "invalidName") {
			return {
				status: "error",
				message: listNameValidationMessage(outcome.reason),
			};
		}
		if (outcome.status === "gone") {
			return { status: "error", message: LIST_GONE_MESSAGE };
		}
		if (outcome.status === "renamed" || outcome.status === "unchanged") {
			return { status: "handled" };
		}
		return { status: "error", message: GENERIC_ERROR_MESSAGE };
	}

	async function deleteList(listId: string): Promise<ListMutationOutcome> {
		const outcome = await collection.actions.deleteList({ listId });
		if (outcome.status === "gone") {
			return { status: "error", message: LIST_GONE_MESSAGE };
		}
		return outcome.status === "deleted"
			? { status: "handled" }
			: { status: "error", message: GENERIC_ERROR_MESSAGE };
	}

	return (
		<ListsScreenView
			session={session}
			collectionState={collection.state}
			onSelectList={select}
			onCreateList={create}
			onRenameList={rename}
			onDeleteList={deleteList}
		/>
	);
}

export type ListsScreenViewProps = {
	session: AuthenticatedAppSession;
	collectionState: ListCollectionState;
	onSelectList: (listId: string) => Promise<void>;
	onCreateList: (name: string) => Promise<CreateListMutationOutcome>;
	onRenameList: (listId: string, name: string) => Promise<ListMutationOutcome>;
	onDeleteList: (listId: string) => Promise<ListMutationOutcome>;
};

export function ListsScreenView({
	session,
	collectionState,
	onSelectList,
	onCreateList,
	onRenameList,
	onDeleteList,
}: ListsScreenViewProps) {
	const listMutationInFlight = useRef(false);
	const [listMutationPending, setListMutationPending] = useState(false);

	async function runListMutation<TOutcome>(
		mutation: () => Promise<TOutcome>,
	): Promise<TOutcome | { status: "ignored" }> {
		if (listMutationInFlight.current) return { status: "ignored" };

		listMutationInFlight.current = true;
		setListMutationPending(true);
		try {
			return await mutation();
		} finally {
			listMutationInFlight.current = false;
			setListMutationPending(false);
		}
	}

	async function createList(name: string): Promise<GuardedListMutationOutcome> {
		const outcome = await runListMutation(() => onCreateList(name));
		if (outcome.status !== "selectionFailed") return outcome;

		themedAlert(
			"Unable to Open List",
			"The List was created, but it could not be opened. Select it from Lists to try again.",
		);
		return { status: "handled" };
	}

	return (
		<ScreenScaffold label="Lists" title={session.activeHousehold.name}>
			<View style={styles.pageContent}>
				<ListCollectionView
					collectionState={collectionState}
					listMutationPending={listMutationPending}
					onSelectList={onSelectList}
					onCreate={() =>
						promptForListName({
							title: "Create List",
							actionLabel: "Create",
							initialName: "",
							failureTitle: "Unable to Create List",
							onSubmit: createList,
						})
					}
					onRename={(summary) =>
						promptForListName({
							title: "Rename List",
							actionLabel: "Save",
							initialName: summary.name,
							failureTitle: "Unable to Rename List",
							onSubmit: (name) =>
								runListMutation(() => onRenameList(summary.id, name)),
						})
					}
					onDelete={(summary) =>
						confirmListDeletion({
							summary,
							onDeleteList: (listId) =>
								runListMutation(() => onDeleteList(listId)),
						})
					}
				/>
			</View>
		</ScreenScaffold>
	);
}

function ListCollectionView({
	collectionState,
	listMutationPending,
	onSelectList,
	onCreate,
	onRename,
	onDelete,
}: {
	collectionState: ListCollectionState;
	listMutationPending: boolean;
	onSelectList: (listId: string) => Promise<void>;
	onCreate: () => void;
	onRename: (summary: ListSummary) => void;
	onDelete: (summary: ListSummary) => void;
}) {
	const { theme } = useUnistyles();
	const loadErrorMessage =
		collectionState.status === "error" ? collectionState.message : null;
	const currentListId =
		collectionState.status === "active" ? collectionState.currentListId : null;
	const { currentSummary, otherSummaries } = useMemo(() => {
		const summaries =
			collectionState.status === "active" ||
			collectionState.status === "resolvingCurrentList"
				? collectionState.summaries
				: [];
		return {
			currentSummary: summaries.find((summary) => summary.id === currentListId),
			otherSummaries: summaries.filter(
				(summary) => summary.id !== currentListId,
			),
		};
	}, [collectionState, currentListId]);

	useEffect(() => {
		if (loadErrorMessage !== null) toast.error(loadErrorMessage);
	}, [loadErrorMessage]);

	return (
		<View style={styles.listLayout}>
			{collectionState.status === "loading" ? (
				<View style={styles.statusContainer}>
					<GlassSurface style={styles.statusSurface}>
						<ActivityIndicator />
					</GlassSurface>
				</View>
			) : collectionState.status === "error" ? null : (
				<FlatList
					alwaysBounceVertical={false}
					contentContainerStyle={styles.rowsContent}
					data={otherSummaries}
					ItemSeparatorComponent={ListItemSeparator}
					keyExtractor={listSummaryKey}
					ListHeaderComponent={
						<View style={styles.collectionHeader}>
							{currentSummary ? (
								<CurrentListCard
									actionsDisabled={listMutationPending}
									onDelete={() => onDelete(currentSummary)}
									onRename={() => onRename(currentSummary)}
									onSelect={() => void onSelectList(currentSummary.id)}
									summary={currentSummary}
								/>
							) : null}
							{otherSummaries.length > 0 ? (
								<ScreenSection
									detail={String(otherSummaries.length)}
									title={currentSummary ? "Other Lists" : "All Lists"}
								/>
							) : null}
						</View>
					}
					renderItem={({ item: summary }) => (
						<ListRow
							actionsDisabled={listMutationPending}
							onDelete={() => onDelete(summary)}
							onRename={() => onRename(summary)}
							onSelect={() => void onSelectList(summary.id)}
							summary={summary}
						/>
					)}
					style={styles.rowsScroll}
				/>
			)}
			<View style={styles.newListButton}>
				<Button
					disabled={listMutationPending}
					onPress={onCreate}
					style={styles.fullWidthButton}
					variant="outline"
				>
					<SymbolView
						accessibilityElementsHidden
						accessible={false}
						name="plus"
						size={17}
						tintColor={theme.colors.foreground}
						weight="medium"
					/>
					<Text style={styles.outlineButtonLabel}>New List</Text>
				</Button>
			</View>
		</View>
	);
}

function CurrentListCard({
	summary,
	actionsDisabled,
	onSelect,
	onRename,
	onDelete,
}: {
	summary: ListSummary;
	actionsDisabled: boolean;
	onSelect: () => void;
	onRename: () => void;
	onDelete: () => void;
}) {
	const { theme } = useUnistyles();

	return (
		<GlassSurface interactive style={styles.currentCard} tone="selected">
			<View style={styles.currentCardHeader}>
				<Badge style={styles.currentBadge}>
					<SymbolView
						accessibilityElementsHidden
						accessible={false}
						name="checkmark"
						size={11}
						tintColor={theme.colors.primaryForeground}
						weight="bold"
					/>
					<Text style={styles.currentBadgeLabel}>Current List</Text>
				</Badge>
				<ActionMenuButton
					accessibilityLabel={`List actions for ${summary.name}`}
					actions={listMenuActions(onRename, onDelete)}
					disabled={actionsDisabled}
				/>
			</View>
			<Button
				accessibilityHint="Opens the Current List"
				accessibilityLabel={summary.name}
				accessibilityState={{ selected: true }}
				onPress={onSelect}
				style={styles.currentCardContent}
				variant="link"
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
						tintColor={theme.colors.mutedForeground}
						weight="semibold"
					/>
				</View>
			</Button>
		</GlassSurface>
	);
}

function ListRow({
	summary,
	actionsDisabled,
	onSelect,
	onRename,
	onDelete,
}: {
	summary: ListSummary;
	actionsDisabled: boolean;
	onSelect: () => void;
	onRename: () => void;
	onDelete: () => void;
}) {
	return (
		<Item size="sm" style={styles.listRow}>
			<Pressable
				accessibilityHint="Makes this the Current List and opens it"
				accessibilityLabel={summary.name}
				accessibilityRole="button"
				onPress={onSelect}
				style={({ pressed }) => [
					styles.listRowAction,
					pressed ? styles.pressed : undefined,
				]}
			>
				<ItemContent>
					<ItemTitle>{summary.name}</ItemTitle>
					<ItemDescription>{listCounts(summary)}</ItemDescription>
				</ItemContent>
			</Pressable>
			<ItemActions style={styles.listRowActions}>
				<ActionMenuButton
					accessibilityLabel={`List actions for ${summary.name}`}
					actions={listMenuActions(onRename, onDelete)}
					disabled={actionsDisabled}
				/>
			</ItemActions>
		</Item>
	);
}

function ListItemSeparator() {
	return <ItemSeparator />;
}

function listSummaryKey(summary: ListSummary): string {
	return summary.id;
}

function listCounts(summary: ListSummary): string {
	return `${summary.uncheckedItemCount} unchecked · ${summary.checkedItemCount} checked`;
}

function listMenuActions(
	onRename: () => void,
	onDelete: () => void,
): ActionMenuItem[] {
	return [
		{ label: "Rename", symbol: "pencil", onPress: onRename },
		{
			label: "Delete",
			symbol: "trash",
			role: "destructive",
			onPress: onDelete,
		},
	];
}

function promptForListName({
	title,
	initialName,
	actionLabel,
	failureTitle,
	onSubmit,
}: {
	title: string;
	initialName: string;
	actionLabel: string;
	failureTitle: string;
	onSubmit: (name: string) => Promise<GuardedListMutationOutcome>;
}) {
	themedPrompt(
		title,
		[
			{ text: "Cancel", style: "cancel" },
			{
				text: actionLabel,
				isPreferred: true,
				onPress: (value?: string) => {
					const attemptedName = value ?? "";
					void submitListNamePrompt({
						title,
						actionLabel,
						attemptedName,
						failureTitle,
						onSubmit,
					});
				},
			},
		],
		initialName,
	);
}

async function submitListNamePrompt({
	title,
	actionLabel,
	attemptedName,
	failureTitle,
	onSubmit,
}: {
	title: string;
	actionLabel: string;
	attemptedName: string;
	failureTitle: string;
	onSubmit: (name: string) => Promise<GuardedListMutationOutcome>;
}) {
	const outcome = await onSubmit(attemptedName);
	showListMutationError({
		outcome,
		failureTitle,
		buttons: [
			{
				text: "OK",
				onPress: () =>
					promptForListName({
						title,
						actionLabel,
						initialName: attemptedName,
						failureTitle,
						onSubmit,
					}),
			},
		],
	});
}

function confirmListDeletion({
	summary,
	onDeleteList,
}: {
	summary: ListSummary;
	onDeleteList: (listId: string) => Promise<GuardedListMutationOutcome>;
}) {
	themedAlert(
		"Delete List",
		`Delete "${summary.name}"? Its Items will no longer be available.`,
		[
			{ text: "Cancel", style: "cancel" },
			{
				text: "Delete",
				style: "destructive",
				onPress: () =>
					void onDeleteList(summary.id).then((outcome) =>
						showListMutationError({
							outcome,
							failureTitle: "Unable to Delete List",
						}),
					),
			},
		],
	);
}

function showListMutationError({
	outcome,
	failureTitle,
	buttons,
}: {
	outcome: GuardedListMutationOutcome;
	failureTitle: string;
	buttons?: Parameters<typeof themedAlert>[2];
}) {
	if (outcome.status === "error") {
		themedAlert(failureTitle, outcome.message, buttons);
	}
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
			<StatusCard title="Household unavailable" body={state.message}>
				<Button onPress={onRetry}>Try again</Button>
			</StatusCard>
		);
	}
	return (
		<StatusCard
			title="Preparing your Household"
			body="Loading your Household Lists."
		>
			<ActivityIndicator />
		</StatusCard>
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
		borderRadius: theme.radii["2xl"],
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
	currentBadge: {
		gap: theme.spacing(1),
		borderRadius: theme.radii.full,
	},
	currentBadgeLabel: {
		...theme.typography.overline,
		color: theme.colors.primaryForeground,
		textTransform: "uppercase",
	},
	currentCardContent: {
		minHeight: theme.spacing(26),
		flexDirection: "column",
		alignItems: "stretch",
		justifyContent: "flex-start",
		paddingHorizontal: theme.spacing(4),
		paddingTop: theme.spacing(1),
		paddingBottom: theme.spacing(4),
	},
	currentName: {
		fontFamily: theme.fontFamilies.serif,
		fontSize: theme.fontSizes["3xl"],
		color: theme.colors.foreground,
	},
	listCounts: {
		...theme.typography.caption,
		color: theme.colors.mutedForeground,
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
		color: theme.colors.foreground,
	},
	newListButton: {
		paddingTop: theme.spacing(3),
	},
	fullWidthButton: {
		alignSelf: "stretch",
	},
	outlineButtonLabel: {
		...theme.typography.callout,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.foreground,
	},
	listRow: {
		gap: theme.spacing(0),
		paddingHorizontal: theme.spacing(0),
		paddingVertical: theme.spacing(0),
	},
	listRowAction: {
		flex: 1,
		minWidth: 0,
		justifyContent: "center",
		paddingLeft: theme.spacing(4),
		paddingRight: theme.spacing(2.5),
		paddingVertical: theme.spacing(3),
	},
	listRowActions: {
		paddingRight: theme.spacing(4),
	},
	pressed: {
		opacity: theme.opacities.pressed,
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
		borderRadius: theme.radii["2xl"],
	},
}));
