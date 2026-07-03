import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { type AuthenticatedAppSession, useSyncState } from "@/client/session";
import { AddItemForm } from "./add-item-form";
import { HomeListSwitcher } from "./home-list-switcher";
import { HomeRetryButton, HomeStatus } from "./home-status";
import { ItemRows } from "./item-rows";
import { ListHeader } from "./list-header";
import type { ActiveListMeta } from "./list-view-types";
import {
	type HomeCurrentListData,
	useHomeCurrentList,
} from "./use-home-current-list";
import { useListActions } from "./use-list-actions";

export type HomeCurrentListDeps = {
	currentList: HomeCurrentListData;
	syncState: ActiveListMeta["syncState"];
};

export type CurrentListProps = {
	session: AuthenticatedAppSession;
	deps?: HomeCurrentListDeps;
};

export function CurrentList({ session, deps }: CurrentListProps) {
	if (deps) {
		return (
			<HomeCurrentListContent
				session={session}
				list={deps.currentList}
				syncState={deps.syncState}
				allowListSwitcher={false}
			/>
		);
	}

	return (
		<HomeCurrentListResource
			key={session.activeHousehold.id}
			session={session}
		/>
	);
}

type HomeCurrentListResourceProps = {
	session: AuthenticatedAppSession;
};

function HomeCurrentListResource({ session }: HomeCurrentListResourceProps) {
	const list = useHomeCurrentList(session);
	const syncState = useSyncState();
	return (
		<HomeCurrentListContent
			session={session}
			list={list}
			syncState={syncState}
			allowListSwitcher
		/>
	);
}

type HomeCurrentListContentProps = {
	session: AuthenticatedAppSession;
	list: HomeCurrentListData;
	syncState: ActiveListMeta["syncState"];
	allowListSwitcher: boolean;
};

function HomeCurrentListContent({
	session,
	list,
	syncState,
	allowListSwitcher,
}: HomeCurrentListContentProps) {
	const currentMemberName = homeSessionMemberName(session);
	const loadState = list.state;
	const [switcherOpen, setSwitcherOpen] = useState(false);

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
							allowListSwitcher ? () => setSwitcherOpen(true) : undefined
						}
						style={({ pressed }) => [
							styles.createButton,
							pressed ? styles.createButtonPressed : undefined,
						]}
					>
						<Text style={styles.createButtonLabel}>Create List</Text>
					</Pressable>
				</HomeStatus>
				{switcherOpen ? (
					<HomeListSwitcher
						session={session}
						currentListId={null}
						initialMode="create"
						onDismiss={() => setSwitcherOpen(false)}
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
				onPressListName={
					allowListSwitcher ? () => setSwitcherOpen(true) : undefined
				}
			/>
			{switcherOpen ? (
				<HomeListSwitcher
					session={session}
					currentListId={loadState.listId}
					onDismiss={() => setSwitcherOpen(false)}
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
	syncState: ActiveListMeta["syncState"];
	onPressListName?: () => void;
};

function ActiveCurrentList({
	loadState,
	currentMemberName,
	syncState,
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
				state={loadState.list}
				meta={{
					currentMemberName,
					errorMessage: actions.errorMessage,
					syncState,
				}}
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
