import { ActivityIndicator } from "react-native";
import type { AddItemListOption } from "@/client/features/list/add-item-composer";
import type { ListSummary } from "@/client/features/list/list-service";
import {
	type AuthenticatedAppSession,
	sessionMemberDisplayName,
} from "@/client/session";
import { Button } from "@/client/ui/button";
import { AddItemForm } from "./add-item-form";
import { HomeRetryButton, HomeStatus } from "./home-status";
import { ItemRows } from "./item-rows";
import { ListOverview } from "./list-overview";
import type { ActiveListSyncState } from "./list-view-types";
import type { HomeCurrentListData } from "./use-home-current-list";
import { useListActions } from "./use-list-actions";
import type { ListRows } from "./use-list-rows";

export type HomeCurrentListDeps = {
	currentList: HomeCurrentListData;
	syncState: ActiveListSyncState;
	listRows: ListRows;
};

export type CurrentListProps = {
	session: AuthenticatedAppSession;
	deps: HomeCurrentListDeps;
	onOpenLists: () => void;
};

export function CurrentList({ session, deps, onOpenLists }: CurrentListProps) {
	const { currentList, syncState, listRows } = deps;
	const currentMemberName = sessionMemberDisplayName(session);
	const loadState = currentList.state;
	const listSummaries = listRows.status === "ready" ? listRows.summaries : [];

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
				<HomeRetryButton onPress={currentList.retry} />
			</HomeStatus>
		);
	}

	if (loadState.status === "zeroActive") {
		return (
			<HomeStatus
				title="No active Lists"
				body="Create a List to start adding Items."
			>
				<Button onPress={onOpenLists}>Create List</Button>
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
		/>
	);
}

type ActiveCurrentListProps = {
	loadState: Extract<HomeCurrentListData["state"], { status: "active" }>;
	currentMemberName: string;
	syncState: ActiveListSyncState;
	listSummaries: ListSummary[];
};

function ActiveCurrentList({
	loadState,
	currentMemberName,
	syncState,
	listSummaries,
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

	// No wrapper View around ItemRows: iOS collapses the native large title by
	// tracking the first scroll view it finds down the screen's first-subview
	// chain, so the FlatList has to stay a direct child of the screen content.
	return (
		<>
			<ItemRows
				items={loadState.list.items}
				listOverview={
					<ListOverview
						state={loadState.list}
						meta={{
							currentMemberName,
							errorMessage: actions.errorMessage,
							syncState,
						}}
					/>
				}
				onToggleItem={actions.toggleItem}
			/>
			<AddItemForm
				currentListId={loadState.listId}
				listOptions={composerListOptions}
				errorMessage={actions.errorMessage}
				onAddItem={actions.addItem}
			/>
		</>
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
