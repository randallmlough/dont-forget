import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { AddItemListOption } from "@/client/features/list/add-item-composer";
import type { ListSummary } from "@/client/features/list/list-service";
import {
	type AuthenticatedAppSession,
	sessionMemberDisplayName,
	useSyncState,
} from "@/client/session";
import { AddItemForm } from "./add-item-form";
import { HomeRetryButton, HomeStatus } from "./home-status";
import { ItemRows } from "./item-rows";
import { ListHeader } from "./list-header";
import type { ActiveListSyncState } from "./list-view-types";
import {
	type HomeCurrentListData,
	useHomeCurrentList,
} from "./use-home-current-list";
import { useListActions } from "./use-list-actions";
import { type ListRows, useListRows } from "./use-list-rows";
import { useSelectList } from "./use-select-list";

export type HomeCurrentListDeps = {
	currentList: HomeCurrentListData;
	syncState: ActiveListSyncState;
};

export type CurrentListProps = {
	session: AuthenticatedAppSession;
	deps?: HomeCurrentListDeps;
	onOpenNavigation: () => void;
	onOpenLists?: () => void;
};

export function CurrentList({
	session,
	deps,
	onOpenNavigation,
	onOpenLists,
}: CurrentListProps) {
	if (deps) {
		return (
			<HomeCurrentListContent
				session={session}
				list={deps.currentList}
				syncState={deps.syncState}
				allowListsEntry={false}
				listRows={{ status: "ready", summaries: [] }}
				onOpenNavigation={onOpenNavigation}
				onOpenLists={onOpenLists}
			/>
		);
	}

	return (
		<HomeCurrentListResource
			key={session.activeHousehold.id}
			session={session}
			onOpenNavigation={onOpenNavigation}
			onOpenLists={onOpenLists}
		/>
	);
}

type HomeCurrentListResourceProps = Omit<CurrentListProps, "deps">;

function HomeCurrentListResource({
	session,
	onOpenNavigation,
	onOpenLists,
}: HomeCurrentListResourceProps) {
	const list = useHomeCurrentList(session);
	const syncState = useSyncState();
	// The single live rows watch feeds the header quick-list chips.
	const { rows } = useListRows(session);
	return (
		<HomeCurrentListContent
			session={session}
			list={list}
			syncState={syncState}
			allowListsEntry
			listRows={rows}
			onOpenNavigation={onOpenNavigation}
			onOpenLists={onOpenLists}
		/>
	);
}

type HomeCurrentListContentProps = {
	session: AuthenticatedAppSession;
	list: HomeCurrentListData;
	syncState: ActiveListSyncState;
	allowListsEntry: boolean;
	listRows: ListRows;
	onOpenNavigation: () => void;
	onOpenLists?: () => void;
};

function HomeCurrentListContent({
	session,
	list,
	syncState,
	allowListsEntry,
	listRows,
	onOpenNavigation,
	onOpenLists,
}: HomeCurrentListContentProps) {
	const currentMemberName = sessionMemberDisplayName(session);
	const loadState = list.state;
	const selectList = useSelectList(session);
	const listSummaries = listRows.status === "ready" ? listRows.summaries : [];

	async function switchList(listId: string, currentListId: string) {
		if (await selectList(listId, currentListId)) list.reload();
	}

	if (loadState.status === "loading") {
		return (
			<HomeStatus
				title="Preparing your Household"
				body="Loading your Household List."
			>
				<ActivityIndicator />
			</HomeStatus>
		);
	}

	if (loadState.status === "error") {
		return (
			<HomeStatus title="List unavailable" body={loadState.message}>
				<HomeRetryButton onPress={list.retry} />
			</HomeStatus>
		);
	}

	if (loadState.status === "zeroActive") {
		return (
			<HomeStatus
				title="No active Lists"
				body="Create a List to start adding Items."
			>
				<Pressable
					accessibilityRole="button"
					onPress={allowListsEntry ? onOpenLists : undefined}
					style={({ pressed }) => [
						styles.createButton,
						pressed ? styles.createButtonPressed : undefined,
					]}
				>
					<Text style={styles.createButtonLabel}>Create List</Text>
				</Pressable>
			</HomeStatus>
		);
	}

	return (
		<ActiveCurrentList
			key={`${session.activeHousehold.id}:${loadState.listId}`}
			loadState={loadState}
			currentMemberName={currentMemberName}
			syncState={syncState}
			listSummaries={listSummaries}
			onOpenNavigation={onOpenNavigation}
			onSelectList={(listId) => void switchList(listId, loadState.listId)}
			onPressListName={allowListsEntry ? onOpenLists : undefined}
		/>
	);
}

type ActiveCurrentListProps = {
	loadState: Extract<HomeCurrentListData["state"], { status: "active" }>;
	currentMemberName: string;
	syncState: ActiveListSyncState;
	listSummaries: ListSummary[];
	onOpenNavigation: () => void;
	onSelectList: (listId: string) => void;
	onPressListName?: () => void;
};

function ActiveCurrentList({
	loadState,
	currentMemberName,
	syncState,
	listSummaries,
	onOpenNavigation,
	onSelectList,
	onPressListName,
}: ActiveCurrentListProps) {
	const actions = useListActions({
		items: loadState.list.items,
		onAddItem: loadState.actions.addItem,
		onSetItemChecked: loadState.actions.setItemChecked,
	});
	const composerListOptions = addItemListOptions({
		currentListId: loadState.listId,
		currentListName: loadState.list.listName,
		summaries: listSummaries,
	});

	return (
		<View style={styles.currentList}>
			<ListHeader
				currentListId={loadState.listId}
				state={loadState.list}
				meta={{
					currentMemberName,
					errorMessage: actions.errorMessage,
					syncState,
				}}
				listSummaries={listSummaries}
				onOpenNavigation={onOpenNavigation}
				onSelectList={onSelectList}
				onPressListName={onPressListName}
			/>
			<ItemRows
				items={loadState.list.items}
				onToggleItem={actions.toggleItem}
			/>
			<AddItemForm
				currentListId={loadState.listId}
				listOptions={composerListOptions}
				errorMessage={actions.errorMessage}
				onAddItem={actions.addItem}
			/>
		</View>
	);
}

function addItemListOptions({
	currentListId,
	currentListName,
	summaries,
}: {
	currentListId: string;
	currentListName: string;
	summaries: readonly ListSummary[];
}): AddItemListOption[] {
	return [
		{ id: currentListId, name: currentListName },
		...summaries
			.filter((summary) => summary.id !== currentListId)
			.map((summary) => ({ id: summary.id, name: summary.name })),
	];
}

const styles = StyleSheet.create((theme) => ({
	currentList: {
		flex: 1,
	},
	createButton: {
		minHeight: theme.spacing(11),
		paddingHorizontal: theme.spacing(4),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.primary,
	},
	createButtonPressed: {
		opacity: theme.opacities.pressed,
	},
	createButtonLabel: {
		...theme.typography.callout,
		color: theme.colors.primaryForeground,
		fontWeight: theme.fontWeights.bold,
	},
}));
