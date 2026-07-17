import { useRef } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { setCurrentListSelection } from "@/client/features/list/current-selection";
import type { ListSummary } from "@/client/features/list/list-service";
import { track } from "@/client/lib/analytics";
import { type AuthenticatedAppSession, useSyncState } from "@/client/session";
import { AddItemForm } from "./add-item-form";
import { HomeListSwitcher } from "./home-list-switcher";
import { HomeRetryButton, HomeStatus } from "./home-status";
import { ItemRows } from "./item-rows";
import { ListHeader } from "./list-header";
import type { ActiveListSyncState } from "./list-view-types";
import {
	type HomeCurrentListData,
	useHomeCurrentList,
} from "./use-home-current-list";
import { useHomeListSwitcherRows } from "./use-home-list-switcher-rows";
import { useListActions } from "./use-list-actions";

export type HomeCurrentListDeps = {
	currentList: HomeCurrentListData;
	syncState: ActiveListSyncState;
};

export type CurrentListProps = {
	session: AuthenticatedAppSession;
	deps?: HomeCurrentListDeps;
	listSwitcherOpen: boolean;
	onListSwitcherOpenChange: (isOpen: boolean) => void;
	onOpenNavigation: () => void;
};

export function CurrentList({
	session,
	deps,
	listSwitcherOpen,
	onListSwitcherOpenChange,
	onOpenNavigation,
}: CurrentListProps) {
	if (deps) {
		return (
			<HomeCurrentListContent
				session={session}
				list={deps.currentList}
				syncState={deps.syncState}
				allowListSwitcher={false}
				listSummaries={[]}
				listSwitcherOpen={listSwitcherOpen}
				onListSwitcherOpenChange={onListSwitcherOpenChange}
				onOpenNavigation={onOpenNavigation}
			/>
		);
	}

	return (
		<HomeCurrentListResource
			key={session.activeHousehold.id}
			session={session}
			listSwitcherOpen={listSwitcherOpen}
			onListSwitcherOpenChange={onListSwitcherOpenChange}
			onOpenNavigation={onOpenNavigation}
		/>
	);
}

type HomeCurrentListResourceProps = Omit<CurrentListProps, "deps">;

function HomeCurrentListResource({
	session,
	listSwitcherOpen,
	onListSwitcherOpenChange,
	onOpenNavigation,
}: HomeCurrentListResourceProps) {
	const list = useHomeCurrentList(session);
	const syncState = useSyncState();
	const { rows } = useHomeListSwitcherRows(session);
	return (
		<HomeCurrentListContent
			session={session}
			list={list}
			syncState={syncState}
			allowListSwitcher
			listSummaries={rows.status === "ready" ? rows.summaries : []}
			listSwitcherOpen={listSwitcherOpen}
			onListSwitcherOpenChange={onListSwitcherOpenChange}
			onOpenNavigation={onOpenNavigation}
		/>
	);
}

type HomeCurrentListContentProps = {
	session: AuthenticatedAppSession;
	list: HomeCurrentListData;
	syncState: ActiveListSyncState;
	allowListSwitcher: boolean;
	listSummaries: ListSummary[];
	listSwitcherOpen: boolean;
	onListSwitcherOpenChange: (isOpen: boolean) => void;
	onOpenNavigation: () => void;
};

function HomeCurrentListContent({
	session,
	list,
	syncState,
	allowListSwitcher,
	listSummaries,
	listSwitcherOpen,
	onListSwitcherOpenChange,
	onOpenNavigation,
}: HomeCurrentListContentProps) {
	const currentMemberName = homeSessionMemberName(session);
	const loadState = list.state;
	const switchingRef = useRef(false);

	async function selectList(listId: string, currentListId: string) {
		if (listId === currentListId || switchingRef.current) return;
		switchingRef.current = true;
		try {
			await setCurrentListSelection(
				session.activeMember.userId,
				session.activeHousehold.id,
				listId,
			);
		} catch {
			switchingRef.current = false;
			return;
		}
		track("list_switched", {
			household_id: session.activeHousehold.id,
			list_id: listId,
			user_id: session.activeMember.userId,
		});
		list.reload();
		switchingRef.current = false;
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
			<>
				<HomeStatus
					title="No active Lists"
					body="Create a List to start adding Items."
				>
					<Pressable
						accessibilityRole="button"
						onPress={
							allowListSwitcher
								? () => onListSwitcherOpenChange(true)
								: undefined
						}
						style={({ pressed }) => [
							styles.createButton,
							pressed ? styles.createButtonPressed : undefined,
						]}
					>
						<Text style={styles.createButtonLabel}>Create List</Text>
					</Pressable>
				</HomeStatus>
				{listSwitcherOpen ? (
					<HomeListSwitcher
						session={session}
						currentListId={null}
						initialMode="create"
						onDismiss={() => onListSwitcherOpenChange(false)}
						// A successful create persists the selection, then re-resolution
						// renders the new empty Current List.
						onSwitched={list.reload}
					/>
				) : null}
			</>
		);
	}

	return (
		<>
			<ActiveCurrentList
				key={`${session.activeHousehold.id}:${loadState.listId}`}
				loadState={loadState}
				currentMemberName={currentMemberName}
				syncState={syncState}
				listSummaries={listSummaries}
				onOpenNavigation={onOpenNavigation}
				onSelectList={(listId) => void selectList(listId, loadState.listId)}
				onPressListName={
					allowListSwitcher ? () => onListSwitcherOpenChange(true) : undefined
				}
			/>
			{listSwitcherOpen ? (
				<HomeListSwitcher
					session={session}
					currentListId={loadState.listId}
					onDismiss={() => onListSwitcherOpenChange(false)}
					// Task 5 re-resolution: re-reads the freshly stored selection and
					// remounts the Current List body via the listId-keyed boundary.
					onSwitched={list.reload}
				/>
			) : null}
		</>
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
				listName={loadState.list.listName}
				errorMessage={actions.errorMessage}
				onAddItem={actions.addItem}
			/>
		</View>
	);
}

export function homeSessionMemberName(
	session: AuthenticatedAppSession | null,
): string {
	if (!session) return "Member";
	return (
		session.activeMember.displayName ??
		session.user.displayName ??
		session.user.email ??
		"Member"
	);
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
		color: theme.colors.inverseText,
		fontWeight: theme.fontWeights.bold,
	},
}));
